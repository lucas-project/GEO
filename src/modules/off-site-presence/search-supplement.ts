import { config } from '@shared/config';
import type { BrandEntityResult, PlatformId } from './schemas';
import type { SearchHit } from './search-engine';
import { runQueryDefSearch } from './targeted-search';
import type { FetchPageFn } from './platforms/types';
import {
  curateSearchHits,
  type SearchSupplementCurationMeta,
} from './curate-search-hits';
import {
  runAdaptiveSearchRounds,
  shouldOrchestrateSearch,
  type SearchOrchestrationMeta,
} from './search-orchestrator';
import { extractPageHints } from './prompts/search-plan';
import type { EntityPageInput } from './resolve-entity';
import { shouldCurateSearchHits } from './curate-search-hits';
import { debugPresenceLog } from './debug-agent-log';
import {
  classifyHits,
  filterOwnSiteHits,
  mergeCrossPlatformHits,
  mergeSupplementHits,
  type SearchSupplementSocialHit,
} from './supplement-helpers';
import type { CrossPlatformPresencePlatform } from './cross-platform-posts';
import { searchQueryWithMarket } from './search-market-hint';
import { seedDirectPlatformHits } from './direct-platform-seeds';
import { isDiscoveryMediaHost } from './media-discovery';
import { SOCIAL_SEARCH_KEYS } from './platform-registry';
import type { PresenceSearchPlan } from './search-plan-types';
import { toSearchBrandLabel } from './search-brand';
import { inferMarketFromDomain } from './market-country';
import type { AgentReachHealth } from './schemas';

export type { SearchSupplementSocialHit };

function mergeFacebookPostHits(target: SearchHit[], incoming: SearchHit[]): void {
  const seen = new Set(target.map((h) => h.url));
  for (const h of incoming) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    target.push(h);
  }
}

export interface SearchSupplementResult {
  queries: { query: string; engine: string; hitCount: number }[];
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  facebookPosts: SearchHit[];
  crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>;
  offSiteDomains: string[];
  /** News / editorial domains from general SERP (excludes review & social hosts). */
  discoveryDomains: string[];
  generalHitEstimate: number;
  verticalHits: Record<string, SearchHit[]>;
  verticalDomains: string[];
  curation?: SearchSupplementCurationMeta;
  orchestration?: SearchOrchestrationMeta;
  /** True when LLM adaptive search rounds ran. */
  llmSearchApplied?: boolean;
  /** Agent Reach CLI enrichment status (xhs-cli, rdt-cli, Jina). */
  agentReach?: AgentReachHealth;
}

export class SearchSupplementRateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxPerMinute: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0]!;
      const wait = 60_000 - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, wait));
    }
    this.timestamps.push(Date.now());
  }
}

interface QueryDef {
  key: string;
  priority: number;
  build: (brand: string, domain: string) => string;
  target?: PlatformId | 'social' | 'social_facebook_posts' | 'general' | 'news' | 'vertical';
  verticalHost?: string;
  verticalId?: string;
}

const PINNED_QUERY_KEYS = new Set(['reddit', 'general', 'news']);
const AU_PINNED_QUERY_KEYS = new Set([
  'whirlpool',
  'productreview',
  'ozbargain',
  'general',
  'news',
]);

function isAuDomain(domain: string): boolean {
  return domain.replace(/^www\./, '').endsWith('.au');
}

function excludeSite(domain: string): string {
  return `-site:${domain.replace(/^www\./, '')}`;
}

function planIncludes(plan: PresenceSearchPlan, target: string): boolean {
  return plan.searchTargets.includes(target);
}

export function buildQueryDefsFromPlan(
  brand: string,
  domain: string,
  plan: PresenceSearchPlan,
): QueryDef[] {
  const ex = excludeSite(domain);
  const quoted = `"${brand}"`;
  const host = domain.replace(/^www\./, '');
  const defs: QueryDef[] = [];
  const withMarket = (q: string) => searchQueryWithMarket(q, domain);
  const isAu = isAuDomain(domain);

  const auPlatformQueries: Array<{ id: PlatformId; priority: number; build: () => string }> = [
    { id: 'whirlpool', priority: 0, build: () => `${quoted} site:forums.whirlpool.net.au ${ex}` },
    { id: 'productreview', priority: 1, build: () => `${quoted} site:productreview.com.au ${ex}` },
    { id: 'ozbargain', priority: 2, build: () => `${quoted} site:ozbargain.com.au ${ex}` },
  ];

  if (isAu) {
    for (const pq of auPlatformQueries) {
      if (planIncludes(plan, pq.id)) {
        defs.push({
          key: pq.id,
          priority: pq.priority,
          target: pq.id,
          build: pq.build,
        });
      }
    }
  }

  if (planIncludes(plan, 'reddit')) {
    defs.push({
      key: 'reddit',
      priority: isAu ? 8 : 0,
      target: 'reddit',
      build: () => withMarket(`${quoted} site:reddit.com ${ex}`),
    });
  }
  defs.push({
    key: 'general',
    priority: 1,
    target: 'general',
    build: () => withMarket(`${quoted} ${ex}`),
  });

  if (planIncludes(plan, 'news')) {
    defs.push({
      key: 'news',
      priority: 2,
      target: 'news',
      build: () => withMarket(`${quoted} news ${ex}`),
    });
  }

  const extendedPlatforms: Array<{ key: string; priority: number; site: string }> = [
    { key: 'xiaohongshu', priority: 24, site: 'xiaohongshu.com' },
    { key: 'zhihu', priority: 25, site: 'zhihu.com' },
    { key: 'tiktok', priority: 26, site: 'tiktok.com' },
    { key: 'amazon_reviews', priority: 27, site: 'amazon.com' },
  ];
  for (const ep of extendedPlatforms) {
    const q =
      ep.key === 'amazon_reviews'
        ? withMarket(`${quoted} review site:${ep.site} ${ex}`)
        : withMarket(`${quoted} site:${ep.site} ${ex}`);
    defs.push({
      key: ep.key,
      priority: ep.priority,
      target: 'general',
      build: () => q,
    });
  }

  const platformQueries: Array<{ id: PlatformId; priority: number; build: () => string }> = [
    { id: 'quora', priority: 20, build: () => withMarket(`${quoted} site:quora.com ${ex}`) },
    { id: 'g2', priority: 21, build: () => withMarket(`${quoted} site:g2.com ${ex}`) },
    { id: 'capterra', priority: 22, build: () => withMarket(`${quoted} site:capterra.com ${ex}`) },
    {
      id: 'trustpilot',
      priority: 23,
      build: () => withMarket(`site:trustpilot.com review ${host}`),
    },
  ];

  if (!isAu) {
    platformQueries.push(
      { id: 'whirlpool', priority: 12, build: () => `${quoted} site:forums.whirlpool.net.au ${ex}` },
      { id: 'productreview', priority: 13, build: () => `${quoted} site:productreview.com.au ${ex}` },
      { id: 'ozbargain', priority: 14, build: () => `${quoted} site:ozbargain.com.au ${ex}` },
    );
  }

  const skipReviewPlatforms =
    plan.category === 'local_service' ? new Set(['g2', 'capterra', 'trustpilot']) : null;

  for (const pq of platformQueries) {
    if (skipReviewPlatforms?.has(pq.id)) continue;
    if (planIncludes(plan, pq.id)) {
      defs.push({
        key: pq.id,
        priority: pq.priority,
        target: pq.id,
        build: pq.build,
      });
    }
  }

  for (const [i, platform] of SOCIAL_SEARCH_KEYS.entries()) {
    defs.push({
      key: `social_${platform}`,
      priority: 30 + i,
      target: 'social',
      build: () => withMarket(`${quoted} ${platform} ${ex}`),
    });
  }
  const topKw = plan.brandKeywords.find((k) => k.trim().includes(' '))?.trim();
  defs.push({
    key: 'social_facebook_posts',
    priority: 28,
    target: 'social_facebook_posts',
    build: () => withMarket(`site:facebook.com ${quoted} ${ex}`),
  });
  defs.push({
    key: 'social_x_posts',
    priority: 29,
    target: 'general',
    build: () => withMarket(`site:x.com ${quoted} ${ex}`),
  });
  if (topKw) {
    defs.push({
      key: 'social_facebook_posts_kw',
      priority: 39,
      target: 'social_facebook_posts',
      build: () => withMarket(`site:facebook.com "${topKw}" ${ex}`),
    });
  }

  for (const [i, q] of plan.customQueries.entries()) {
    if (!q.trim()) continue;
    defs.push({
      key: `custom_${i}`,
      priority: 3 + i,
      target: 'general',
      build: () => q,
    });
  }

  for (const [i, src] of plan.additionalSources.entries()) {
    defs.push({
      key: `vertical_${src.id}`,
      priority: 15 + i,
      target: 'vertical',
      verticalHost: src.host,
      verticalId: src.id,
      build: () => `${quoted} site:${src.host} ${ex}`,
    });
  }

  const keywordQueries = pickKeywordSearchPhrases(plan.brandKeywords, brand);
  for (const [i, phrase] of keywordQueries.entries()) {
    const q = `"${phrase}"`;
    defs.push({
      key: `kw_reddit_${i}`,
      priority: 8 + i,
      target: 'reddit',
      build: () => withMarket(`${q} site:reddit.com ${ex}`),
    });
    defs.push({
      key: `kw_general_${i}`,
      priority: 11 + i,
      target: 'general',
      build: () => withMarket(`${q} ${ex}`),
    });
  }

  defs.sort((a, b) => a.priority - b.priority);
  return defs;
}

/** Multi-word product/service phrases for disambiguated search (skip bare brand slug). */
function pickKeywordSearchPhrases(keywords: string[], brand: string): string[] {
  const brandLower = brand.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const phrase = raw.trim();
    if (!phrase || phrase.length < 4) continue;
    const lower = phrase.toLowerCase();
    if (lower === brandLower) continue;
    if (!phrase.includes(' ') && phrase.length < 10) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(phrase);
    if (out.length >= 3) break;
  }
  return out;
}

/** Always run pinned queries; fill remaining budget with other defs. */
export function selectQueryDefs(allDefs: QueryDef[], maxQueries: number, domain?: string): QueryDef[] {
  const pinnedKeys = domain && isAuDomain(domain) ? AU_PINNED_QUERY_KEYS : PINNED_QUERY_KEYS;
  const pinned = allDefs.filter((d) => pinnedKeys.has(d.key));
  const rest = allDefs.filter((d) => !pinnedKeys.has(d.key));
  const slots = Math.max(pinned.length, maxQueries);
  const remaining = Math.max(0, slots - pinned.length);
  return [...pinned, ...rest.slice(0, remaining)];
}

export interface RunSearchSupplementInput {
  brand: BrandEntityResult;
  domain: string;
  fetchPage: FetchPageFn;
  searchPlan: PresenceSearchPlan;
  pages?: EntityPageInput[];
  onProgress?: (progress: number, message: string) => void | Promise<void>;
}

function recordHitDomains(
  hits: SearchHit[],
  offSiteDomains: Set<string>,
  discoveryDomains: Set<string>,
  verticalHits: Record<string, SearchHit[]>,
  additionalSources: PresenceSearchPlan['additionalSources'],
): void {
  for (const h of hits) {
    try {
      const host = new URL(h.url).hostname.replace(/^www\./, '');
      offSiteDomains.add(host);
      if (isDiscoveryMediaHost(host)) discoveryDomains.add(host);
      const verticalMatch = additionalSources.find((s) =>
        host.includes(s.host.replace(/^www\./, '')),
      );
      if (verticalMatch) {
        const list = verticalHits[verticalMatch.id] ?? [];
        list.push(h);
        verticalHits[verticalMatch.id] = list;
      }
    } catch {
      /* skip */
    }
  }
}

export async function runSearchSupplement(
  input: RunSearchSupplementInput,
): Promise<SearchSupplementResult | null> {
  if (!config.presenceProbe.searchSupplementEnabled) return null;

  const rawBrand =
    input.brand.confidence < 0.7 && input.brand.aliases[0]
      ? input.brand.aliases[0]
      : input.brand.primaryBrand;
  const brand = toSearchBrandLabel(rawBrand);
  const domain = input.domain.replace(/^www\./, '');

  const pageHints = extractPageHints(input.pages);
  const allDefs = buildQueryDefsFromPlan(brand, domain, input.searchPlan);
  const maxQueries = config.presenceProbe.searchSupplementMaxQueries;
  const defs = selectQueryDefs(allDefs, maxQueries, domain);

  const limiter = new SearchSupplementRateLimiter(config.presenceProbe.requestsPerMinute);
  const queries: SearchSupplementResult['queries'] = [];
  const byPlatform: Partial<Record<PlatformId, SearchHit[]>> = {};
  const social: SearchSupplementSocialHit[] = [];
  const facebookPosts: SearchHit[] = [];
  const crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>> = {};
  const verticalHits: Record<string, SearchHit[]> = {};
  const offSiteDomains = new Set<string>();
  const discoveryDomains = new Set<string>();
  let generalHitEstimate = 0;

  const CONCURRENCY = 2;
  const searchProgressStart = 20;
  const searchProgressEnd = 45;

  for (let i = 0; i < defs.length; i += CONCURRENCY) {
    const batch = defs.slice(i, i + CONCURRENCY);
    const done = Math.min(i + CONCURRENCY, defs.length);
    const label = batch.map((d) => d.target ?? 'general').join(', ');
    const pct =
      searchProgressStart +
      Math.floor((done / Math.max(1, defs.length)) * (searchProgressEnd - searchProgressStart));
    await input.onProgress?.(pct, `Web search (${done}/${defs.length}): ${label}…`);

    await Promise.all(
      batch.map(async (def) => {
        await limiter.wait();
        const { hits, engine, query } = await runQueryDefSearch(
          def,
          brand,
          domain,
          input.fetchPage,
        );
        const filtered = filterOwnSiteHits(hits, domain);
        queries.push({
          query,
          engine: engine ?? 'none',
          hitCount: filtered.length,
        });

        const classified = classifyHits(filtered, domain);
        mergeSupplementHits(byPlatform, classified.byPlatform);

        for (const d of classified.discovery) {
          try {
            const host = new URL(d.url).hostname.replace(/^www\./, '');
            if (isDiscoveryMediaHost(host)) discoveryDomains.add(host);
            offSiteDomains.add(host);
          } catch {
            /* skip */
          }
        }

        if (def.target === 'social') {
          for (const s of classified.social) {
            if (!social.some((x) => x.url === s.url)) social.push(s);
          }
        }
        mergeFacebookPostHits(facebookPosts, classified.facebookPosts);
        mergeCrossPlatformHits(crossPlatformPosts, classified.crossPlatformPosts);

        // #region agent log
        fetch('http://127.0.0.1:7325/ingest/c387cd27-4cf0-4de4-9c91-94fb3cf9648b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a09fef'},body:JSON.stringify({sessionId:'a09fef',location:'search-supplement.ts:query-result',message:'per-query result',data:{query,target:def.target,rawHits:hits.length,filteredHits:filtered.length,socialClassified:classified.social.length,platformClassified:Object.fromEntries(Object.entries(classified.byPlatform).map(([k,v])=>[k,(v as unknown[]).length])),firstUrls:filtered.slice(0,3).map((h:{url:string})=>h.url)},hypothesisId:'H4',timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        if (def.target === 'vertical' && def.verticalId) {
          const list = verticalHits[def.verticalId] ?? [];
          verticalHits[def.verticalId] = [...list, ...filtered];
        }

        if (def.target === 'general' || def.target === 'news' || def.target === 'vertical') {
          if (def.target === 'general' || def.target === 'news') {
            generalHitEstimate = Math.max(generalHitEstimate, filtered.length);
          }
          recordHitDomains(
            filtered,
            offSiteDomains,
            discoveryDomains,
            verticalHits,
            input.searchPlan.additionalSources,
          );
        }
      }),
    );
  }

  const seeds = seedDirectPlatformHits(brand, domain, input.searchPlan);
  for (const [id, hits] of Object.entries(seeds) as [PlatformId, SearchHit[]][]) {
    if (!hits?.length || byPlatform[id]?.length) continue;
    byPlatform[id] = hits;
    queries.push({
      query: `direct:${id}`,
      engine: 'seed',
      hitCount: hits.length,
    });
  }

  if (generalHitEstimate === 0 && planIncludes(input.searchPlan, 'news')) {
    const newsQuery = `${brand} news ${excludeSite(domain)}`;
    await limiter.wait();
    const { hits, engine } = await runQueryDefSearch(
      { key: 'news_fallback', target: 'news', build: () => newsQuery },
      brand,
      domain,
      input.fetchPage,
    );
    const filtered = filterOwnSiteHits(hits, domain);
    queries.push({ query: newsQuery, engine: engine ?? 'none', hitCount: filtered.length });
    generalHitEstimate = filtered.length;
    for (const h of filtered) {
      try {
        offSiteDomains.add(new URL(h.url).hostname.replace(/^www\./, ''));
      } catch {
        /* skip */
      }
    }
  }

  // #region agent log
  debugPresenceLog(
    'search-supplement.ts:pre-adaptive',
    'search supplement gates before LLM rounds',
    {
      shouldOrchestrate: shouldOrchestrateSearch(),
      shouldCurate: shouldCurateSearchHits(),
      aiProvider: config.ai.provider,
      fixedQueryCount: queries.length,
      socialAfterFixed: social.length,
    },
    'H1-H2',
  );
  // #endregion

  // Web footprint recovery is handled by runAdaptiveSearchRounds (round 1 when webFootprintWeak)
  // — skip a separate recovery LLM call to reduce API usage.

  await input.onProgress?.(42, 'Running adaptive search rounds…');

  const adaptive = await runAdaptiveSearchRounds({
    brand: input.brand,
    domain,
    fetchPage: input.fetchPage,
    searchPlan: input.searchPlan,
    byPlatform,
    social,
    facebookPosts,
    crossPlatformPosts,
    queries,
    limiter,
    serpHttpOnly: true,
    generalHitEstimate,
    offSiteDomainCount: offSiteDomains.size,
  });

  let finalByPlatform = adaptive.byPlatform;
  let finalSocial = adaptive.social;
  const finalFacebookPosts = adaptive.facebookPosts;
  const finalCrossPlatformPosts = adaptive.crossPlatformPosts;
  const finalQueries = adaptive.queries;
  const orchestration = adaptive.meta ?? undefined;
  const llmSearchApplied = Boolean(orchestration && orchestration.queriesAdded > 0);

  const generalQ = finalQueries.find(
    (q) => !q.query.startsWith('direct:') && !/\bsite:/i.test(q.query),
  );
  if (generalQ && generalQ.hitCount > generalHitEstimate) {
    generalHitEstimate = generalQ.hitCount;
  }

  const verticalHitCount = Object.values(verticalHits).reduce((n, h) => n + h.length, 0);
  generalHitEstimate = Math.max(
    generalHitEstimate,
    verticalHitCount,
    offSiteDomains.size,
  );

  const offSiteDomainsFinal = new Set<string>();
  for (const hits of Object.values(finalByPlatform)) {
    for (const h of hits ?? []) {
      try {
        offSiteDomainsFinal.add(new URL(h.url).hostname.replace(/^www\./, ''));
      } catch {
        /* skip */
      }
    }
  }

  let curation: SearchSupplementCurationMeta | undefined;

  const curated = await curateSearchHits({
    brand: input.brand,
    domain,
    siteKeywords: input.searchPlan.brandKeywords,
    byPlatform: finalByPlatform,
    social: finalSocial,
    queries: finalQueries,
  });

  if (curated) {
    finalByPlatform = curated.byPlatform;
    finalSocial = curated.social.slice(0, 12);
    curation = curated.meta;
  }

  // #region agent log
  debugPresenceLog(
    'search-supplement.ts:done',
    'search supplement result',
    {
      orchestrationRan: Boolean(adaptive.meta),
      queriesAdded: adaptive.meta?.queriesAdded ?? 0,
      curationApplied: curation?.applied ?? false,
      finalSocial: finalSocial.length,
      llmSearchApplied,
    },
    'H2-H3',
  );
  // #endregion

  const verticalDomains = [
    ...new Set(
      Object.values(verticalHits).flatMap((hits) =>
        hits.map((h) => {
          try {
            return new URL(h.url).hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        }),
      ),
    ),
  ].filter(Boolean);

  let result: SearchSupplementResult = {
    queries: finalQueries,
    byPlatform: finalByPlatform,
    social: finalSocial.slice(0, 12),
    facebookPosts: finalFacebookPosts.slice(0, 24),
    crossPlatformPosts: finalCrossPlatformPosts,
    offSiteDomains: [...new Set([...offSiteDomains, ...offSiteDomainsFinal])].slice(0, 15),
    discoveryDomains: [...discoveryDomains].slice(0, 10),
    generalHitEstimate,
    verticalHits,
    verticalDomains,
    curation,
    orchestration,
    llmSearchApplied,
  };

  if (config.presenceProbe.agentReachEnabled) {
    const keywords = [...(input.searchPlan.brandKeywords ?? [])].slice(0, 8);
    const { enrichSearchSupplementWithAgentReach } = await import(
      './agent-reach/enrich-supplement'
    );
    result = await enrichSearchSupplementWithAgentReach(result, {
      brand: input.brand,
      domain,
      keywords,
    });
  }

  return result;
}
