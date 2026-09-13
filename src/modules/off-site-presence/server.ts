import 'server-only';

export { fetchSiteKeywords } from './site-keywords-service';
import { confirmedProfileForUrl } from '@modules/site-profile';



import { normalizeWebsiteUrl } from '@/lib/website-url';

import { config } from '@shared/config';

import { crawlSinglePage } from '@modules/crawling/server';

import { createFetchPage } from './fetch-off-site-page';
import { createBudgetedFetchPage } from './fetch-budget';

import { extractSchemas } from '@modules/extraction';

import * as cheerio from 'cheerio';

import { normalizeDomain } from './aliases';

import { assembleReport } from './report';

import { resolveBrandEntity, type EntityPageInput } from './resolve-entity';

import { runPlatformProbes } from './orchestrator';

import type { OffSitePresenceReport } from './schemas';

import { runSerperBoost } from './serper-boost';

import { runSearchSupplement } from './search-supplement';

import { debugPresenceLog } from './debug-agent-log';

import { shouldCurateSearchHits } from './curate-search-hits';

import { shouldOrchestrateSearch } from './search-orchestrator';

import { fetchWikipediaNotability } from './media-discovery';

import { extractRichPageContext } from './page-context';
import { resolveProbeSetup, shouldUseBatchedProbeSetup } from './probe-setup-llm';
import { enrichBrandEntityWithLlm } from './enrich-brand-entity';
import { resolveProbeSiteKeywords } from './resolve-probe-keywords';
import { resolveSearchPlan } from './search-plan';



export type PresenceProgressReporter = (update: {

  progress: number;

  message: string;

}) => void | Promise<void>;



export interface RunOffSitePresenceProbeInput {

  siteUrl: string;

  brandOverride?: string;

  /** On-page keywords from workspace detection (5–10 terms). */
  siteKeywords?: string[];

  playwrightEnabled?: boolean;

  pages?: EntityPageInput[];

  onProgress?: PresenceProgressReporter;

}



async function reportProgress(

  onProgress: PresenceProgressReporter | undefined,

  progress: number,

  message: string,

): Promise<void> {

  await onProgress?.({ progress, message });

}



async function loadEntityPages(

  siteUrl: string,

  existing?: EntityPageInput[],

): Promise<EntityPageInput[]> {

  if (existing?.length) return existing;



  const normalized = normalizeWebsiteUrl(siteUrl);

  const pages: EntityPageInput[] = [];



  const urls = [normalized, `${normalized.replace(/\/$/, '')}/about`];

  for (const url of urls) {

    try {

      const page = await crawlSinglePage(url, {

        timeoutMs: config.crawl.timeoutMs,

        screenshot: false,

        auditId: 'presence-probe',

        profile: 'hub',

      });

      const html = page.renderedHtml ?? page.html ?? '';

      if (!html) continue;

      const $ = cheerio.load(html);

      const schemas = extractSchemas($);

      pages.push({ url: page.finalUrl || url, html, schemas });

    } catch {

      /* skip */

    }

  }



  return pages;

}



export async function runOffSitePresenceProbe(

  input: RunOffSitePresenceProbeInput,

): Promise<OffSitePresenceReport> {

  const started = Date.now();

  const siteUrl = normalizeWebsiteUrl(input.siteUrl);
  const confirmed = await confirmedProfileForUrl(siteUrl);
  if (confirmed) input = { ...input, brandOverride: confirmed.primaryEntity.name, siteKeywords: confirmed.offerings };

  const domain = normalizeDomain(siteUrl);

  const playwrightEnabled =

    input.playwrightEnabled ?? config.presenceProbe.enabled;

  const onProgress = input.onProgress;



  await reportProgress(onProgress, 8, 'Reading your website…');

  const pages = await loadEntityPages(siteUrl, input.pages);



  await reportProgress(onProgress, 12, 'Planning probe (brand, keywords, search)…');

  let entity = resolveBrandEntity({
    siteUrl,
    pages,
    brandOverride: input.brandOverride,
  });

  const pageContext = extractRichPageContext(pages);

  let siteKeywords: string[];
  let searchPlan: Awaited<ReturnType<typeof resolveSearchPlan>>;

  if (!confirmed && shouldUseBatchedProbeSetup()) {
    const setup = await resolveProbeSetup({
      entity,
      domain,
      pages,
      pageContext,
      prefetchedKeywords: input.siteKeywords,
    });
    entity = setup.entity;
    siteKeywords = setup.siteKeywords;
    searchPlan = setup.searchPlan;
  } else {
    const brandEnrichment = await enrichBrandEntityWithLlm({
      entity,
      domain,
      pageContext,
    });
    let llmSearchTerms: string[] | undefined;
    if (brandEnrichment && !confirmed) {
      entity = brandEnrichment.entity;
      llmSearchTerms = brandEnrichment.searchTerms;
    }

    await reportProgress(onProgress, 15, 'Detecting site keywords…');
    siteKeywords = await resolveProbeSiteKeywords({
      pages,
      prefetched: input.siteKeywords,
      llmSearchTerms,
    });

    await reportProgress(onProgress, 18, 'Planning search strategy…');
    searchPlan = await resolveSearchPlan({
      brand: entity,
      domain,
      pages,
      siteKeywords,
    });
  }

  const fetchPage = createBudgetedFetchPage(createFetchPage(playwrightEnabled));
  const sources: OffSitePresenceReport['meta']['sources'] = [];

  let searchSupplement = null;

  if (playwrightEnabled && config.presenceProbe.searchSupplementEnabled) {

    searchSupplement = await runSearchSupplement({

      brand: entity,

      domain,

      fetchPage,

      searchPlan,

      pages,

      onProgress: async (progress, message) => reportProgress(onProgress, progress, message),

    });

  } else {

    await reportProgress(onProgress, 45, 'Skipping web search supplement…');

  }



  await reportProgress(onProgress, 48, 'Checking external platforms…');

  const [platforms, serperBoost, wikipedia] = await Promise.all([

    runPlatformProbes({

      brand: entity,

      domain,

      siteUrl,

      fetchPage,

      playwrightEnabled,

      searchPlan,

      searchSupplement,

      onProgress: async (progress, message) => reportProgress(onProgress, progress, message),

    }),

    runSerperBoost({ brandName: entity.primaryBrand, siteUrl }),

    fetchWikipediaNotability(entity.primaryBrand),

  ]);



  if (playwrightEnabled) sources.push('playwright');

  if (pages.length > 0) sources.push('crawl');

  if (searchSupplement) sources.push('search');

  if (searchSupplement?.llmSearchApplied) sources.push('llm-search');

  if (serperBoost) sources.push('serper');



  // #region agent log

  debugPresenceLog(

    'server.ts:probe-complete',

    'presence probe pipeline summary',

    {

      aiProvider: config.ai.provider,

      searchCurateEnabled: config.presenceProbe.searchCurateEnabled,

      searchOrchestrateEnabled: config.presenceProbe.searchOrchestrateEnabled,

      shouldCurate: shouldCurateSearchHits(),

      shouldOrchestrate: shouldOrchestrateSearch(),

      sources,

      primaryBrand: entity.primaryBrand,

      brandOverride: input.brandOverride ?? null,

      supplementSocial: searchSupplement?.social.length ?? 0,

      supplementQueries: searchSupplement?.queries.length ?? 0,

      llmSearchApplied: searchSupplement?.llmSearchApplied ?? false,

      curationApplied: searchSupplement?.curation?.applied ?? false,

      platformStatuses: Object.fromEntries(

        Object.entries(platforms).map(([k, v]) => [k, v?.status]),

      ),

      searchPlanCategory: searchPlan.category,

      searchPlanSource: searchPlan.source,

    },

    'H1-H2',

  );

  // #endregion



  await reportProgress(onProgress, 85, 'Checking media & Wikipedia…');

  await reportProgress(onProgress, 90, 'Building influence report…');



  return await assembleReport({

    domain,

    siteUrl,

    durationMs: Date.now() - started,

    entity,

    platforms,

    sources,

    playwrightEnabled,

    serperBoost,

    searchSupplement,

    searchPlan,

    siteKeywords,

    wikipediaPresent: wikipedia.present,

  });

}


