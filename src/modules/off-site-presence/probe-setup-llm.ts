import { z } from 'zod';
import { ai, generateCachedStructuredOutput } from '@shared/ai';
import { config } from '@shared/config';
import { logger } from '@shared/logger';
import { buildBrandAliases } from './aliases';
import { detectSiteKeywordsFromPages } from './detect-site-keywords';
import { shouldEnrichBrandWithLlm } from './enrich-brand-entity';
import { extractPageHints } from './page-context';
import { resolvePresenceModel } from './model';
import type { BrandEntityResult } from './schemas';
import type { EntityPageInput } from './resolve-entity';
import {
  mergeSiteKeywordsIntoPlan,
  resolveHeuristicSearchPlan,
  sanitizeLlmPlan,
  shouldUseLlmSearchPlan,
} from './search-plan';
import { SearchPlanLlmOutputSchema, type PresenceSearchPlan } from './search-plan-types';
import { PROBE_SETUP_SYSTEM, buildProbeSetupPrompt } from './prompts/probe-setup';
import { resolvedSiteKeywordsProviderName } from '@shared/ai';

export const ProbeSetupLlmOutputSchema = SearchPlanLlmOutputSchema.extend({
  primaryBrand: z.string().min(2).max(80),
  aliases: z.array(z.string()).max(6),
  businessSummary: z.string().max(200).optional(),
});

/** One LLM call for brand + keywords + search plan (same provider only). */
export function shouldUseBatchedProbeSetup(): boolean {
  if (!shouldUseLlmSearchPlan()) return false;
  const kwOverride = config.siteKeywords.aiProvider;
  if (
    kwOverride &&
    kwOverride !== 'inherit' &&
    kwOverride !== config.ai.provider
  ) {
    return false;
  }
  return true;
}

function mergeKeywordList(...sources: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of sources) {
    for (const raw of list ?? []) {
      const k = raw.trim();
      if (!k || k.length < 3) continue;
      const lower = k.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(k);
      if (out.length >= 10) return out;
    }
  }
  return out;
}

function applyBrandFromSetup(
  entity: BrandEntityResult,
  data: z.infer<typeof ProbeSetupLlmOutputSchema>,
  enrichBrand: boolean,
): BrandEntityResult {
  if (!enrichBrand) return entity;

  const primary = data.primaryBrand.trim();
  const aliasSet = new Set<string>();
  const originalPrimary = entity.primaryBrand.trim();
  if (
    originalPrimary.length >= 2 &&
    originalPrimary.toLowerCase() !== primary.toLowerCase()
  ) {
    aliasSet.add(originalPrimary);
  }
  for (const a of [...data.aliases, ...buildBrandAliases(primary)]) {
    const t = a.trim();
    if (t.length >= 2 && t.toLowerCase() !== primary.toLowerCase()) aliasSet.add(t);
  }

  return {
    ...entity,
    primaryBrand: primary,
    aliases: [...aliasSet].slice(0, 8),
    confidence: Math.max(entity.confidence, 0.88),
    needsReview: false,
    sources: [...entity.sources, 'llm-probe-setup'],
  };
}

export interface ResolveProbeSetupInput {
  entity: BrandEntityResult;
  domain: string;
  pages: EntityPageInput[];
  pageContext: string;
  prefetchedKeywords?: string[];
}

export interface ResolveProbeSetupResult {
  entity: BrandEntityResult;
  siteKeywords: string[];
  searchPlan: PresenceSearchPlan;
  batched: boolean;
}

async function resolveProbeSetupHeuristic(
  input: ResolveProbeSetupInput,
): Promise<ResolveProbeSetupResult> {
  const detected = detectSiteKeywordsFromPages(input.pages);
  const siteKeywords = mergeKeywordList(input.prefetchedKeywords, detected);
  let plan = resolveHeuristicSearchPlan({
    brand: input.entity,
    domain: input.domain,
    pages: input.pages,
  });
  if (siteKeywords.length > 0) {
    plan = mergeSiteKeywordsIntoPlan(
      plan,
      siteKeywords,
      extractPageHints(input.pages),
      input.entity.primaryBrand,
    );
  }
  return {
    entity: input.entity,
    siteKeywords,
    searchPlan: plan,
    batched: false,
  };
}

export async function resolveProbeSetup(
  input: ResolveProbeSetupInput,
): Promise<ResolveProbeSetupResult> {
  if (!shouldUseBatchedProbeSetup()) {
    return resolveProbeSetupHeuristic(input);
  }

  const domain = input.domain.replace(/^www\./, '');
  const pageHints = extractPageHints(input.pages);
  const detected = detectSiteKeywordsFromPages(input.pages);
  const enrichBrand = shouldEnrichBrandWithLlm(input.entity);

  const prompt = buildProbeSetupPrompt({
    entity: input.entity,
    domain,
    pageContext: input.pageContext,
    pageHints,
    candidateKeywords: mergeKeywordList(input.prefetchedKeywords, detected),
    prefetchedKeywords: input.prefetchedKeywords,
    enrichBrand,
  });

  try {
    const presenceModel = resolvePresenceModel(ai.name);
    const { data } = await generateCachedStructuredOutput(
      ai,
      {
        schema: ProbeSetupLlmOutputSchema,
        schemaName: 'ProbeSetup',
        system: PROBE_SETUP_SYSTEM,
        prompt,
        temperature: 0.15,
        ...(presenceModel ? { model: presenceModel } : {}),
      },
      { namespace: 'presence-probe-setup-v1', ttlSeconds: 86_400 },
    );

    const entity = applyBrandFromSetup(input.entity, data, enrichBrand);
    const siteKeywords = mergeKeywordList(
      input.prefetchedKeywords,
      data.brandKeywords,
      detected,
    );

    const planFields = SearchPlanLlmOutputSchema.parse(data);
    let searchPlan = sanitizeLlmPlan(
      planFields,
      domain,
      pageHints,
      entity.primaryBrand,
    );
    if (siteKeywords.length > 0) {
      searchPlan = mergeSiteKeywordsIntoPlan(
        searchPlan,
        siteKeywords,
        pageHints,
        entity.primaryBrand,
      );
    }

    logger.info(
      {
        brand: entity.primaryBrand,
        keywords: siteKeywords.length,
        category: searchPlan.category,
        provider: ai.name,
        keywordsProvider: resolvedSiteKeywordsProviderName(),
      },
      'probe setup resolved via batched LLM',
    );

    return { entity, siteKeywords, searchPlan, batched: true };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'batched probe setup failed — using heuristic fallback',
    );
    return resolveProbeSetupHeuristic(input);
  }
}
