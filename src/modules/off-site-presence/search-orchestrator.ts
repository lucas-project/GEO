import { z } from 'zod';
import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { BrandEntityResult, PlatformId } from './schemas';
import { runBingDdgSearch, type SearchHit } from './search-engine';
import type { FetchPageFn } from './platforms/types';
import { buildCurationCandidates } from './curate-search-hits';
import {
  classifyHits,
  filterOwnSiteHits,
  mergeCrossPlatformHits,
  mergeSupplementHits,
  type SearchSupplementSocialHit,
} from './supplement-helpers';
import type { CrossPlatformPresencePlatform } from './cross-platform-posts';
import { plannedSearchPlatformIds } from './platform-registry';
import type { PresenceSearchPlan } from './search-plan-types';
import { shouldRunWebSearchRecovery } from './llm-web-search-recovery';
import {
  SEARCH_ORCHESTRATION_SYSTEM,
  buildSearchOrchestrationPrompt,
} from './prompts/search-orchestration';
import { resolvePresenceModel } from './model';

export const SearchOrchestrationSchema = z.object({
  stop: z.boolean(),
  reason: z.string(),
  nextQueries: z.array(z.string()).max(8),
});

export type SearchOrchestrationOutput = z.infer<typeof SearchOrchestrationSchema>;

export interface SearchOrchestrationMeta {
  roundsRun: number;
  queriesAdded: number;
  stoppedReason: string;
}

export interface SearchRateLimiter {
  wait(): Promise<void>;
}

export function shouldOrchestrateSearch(): boolean {
  return (
    config.presenceProbe.searchOrchestrateEnabled && config.ai.provider !== 'mock'
  );
}

export function detectPlatformGaps(
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>,
  social: SearchSupplementSocialHit[],
  plan: PresenceSearchPlan,
): { probedPlatforms: PlatformId[]; socialEmpty: boolean } {
  const planned = plannedSearchPlatformIds(plan);
  const probedPlatforms = planned.filter((id) => !byPlatform[id]?.length);
  const socialEmpty =
    plan.searchTargets.includes('social') ? social.length === 0 : false;
  return {
    probedPlatforms,
    socialEmpty,
  };
}

export function detectSearchGaps(input: {
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  plan: PresenceSearchPlan;
  generalHitEstimate: number;
  offSiteDomainCount: number;
}): {
  probedPlatforms: PlatformId[];
  socialEmpty: boolean;
  webFootprintWeak: boolean;
} {
  const platformGaps = detectPlatformGaps(
    input.byPlatform,
    input.social,
    input.plan,
  );
  const webFootprintWeak = shouldRunWebSearchRecovery(
    input.generalHitEstimate,
    input.offSiteDomainCount,
  );
  return { ...platformGaps, webFootprintWeak };
}

export function gapsFullyFilled(gaps: ReturnType<typeof detectSearchGaps>): boolean {
  return (
    gaps.probedPlatforms.length === 0 &&
    !gaps.socialEmpty &&
    !gaps.webFootprintWeak
  );
}

function countOffSiteDomains(
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>,
  social: SearchSupplementSocialHit[],
): number {
  const hosts = new Set<string>();
  for (const hits of Object.values(byPlatform)) {
    for (const h of hits ?? []) {
      try {
        hosts.add(new URL(h.url).hostname.replace(/^www\./, ''));
      } catch {
        /* skip */
      }
    }
  }
  for (const s of social) {
    try {
      hosts.add(new URL(s.url).hostname.replace(/^www\./, ''));
    } catch {
      /* skip */
    }
  }
  return hosts.size;
}

function isQueryAllowedForPlan(query: string, plan: PresenceSearchPlan): boolean {
  const lower = query.toLowerCase();
  for (const skip of plan.skipPlatforms) {
    const id = skip.id.toLowerCase();
    if (id === 'g2' && /site:\s*g2\.com/i.test(lower)) return false;
    if (id === 'capterra' && /site:\s*capterra\.com/i.test(lower)) return false;
    if (id === 'trustpilot' && /site:\s*trustpilot\.com/i.test(lower)) return false;
    if (id === 'quora' && /site:\s*quora\.com/i.test(lower)) return false;
    if (id === 'reddit' && /site:\s*reddit\.com/i.test(lower)) return false;
  }
  return true;
}

function normalizeQuery(q: string, domain: string): string {
  const trimmed = q.trim();
  if (!trimmed) return trimmed;
  const ex = `-site:${domain.replace(/^www\./, '')}`;
  if (trimmed.toLowerCase().includes('-site:')) return trimmed;
  return `${trimmed} ${ex}`;
}

function mergeFacebookPostHits(target: SearchHit[], incoming: SearchHit[]): void {
  const seen = new Set(target.map((h) => h.url));
  for (const h of incoming) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    target.push(h);
  }
}

export interface RunAdaptiveSearchInput {
  brand: BrandEntityResult;
  domain: string;
  fetchPage: FetchPageFn;
  searchPlan: PresenceSearchPlan;
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  facebookPosts: SearchHit[];
  crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>;
  queries: { query: string; engine: string; hitCount: number }[];
  limiter: SearchRateLimiter;
  /** HTTP-only SERP when invoked from search supplement (no Playwright). */
  serpHttpOnly?: boolean;
  generalHitEstimate: number;
  offSiteDomainCount: number;
}

export async function runAdaptiveSearchRounds(
  input: RunAdaptiveSearchInput,
): Promise<{
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  facebookPosts: SearchHit[];
  crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>;
  queries: { query: string; engine: string; hitCount: number }[];
  meta: SearchOrchestrationMeta | null;
}> {
  if (!shouldOrchestrateSearch()) {
    return {
      byPlatform: input.byPlatform,
      social: input.social,
      facebookPosts: input.facebookPosts,
      crossPlatformPosts: input.crossPlatformPosts,
      queries: input.queries,
      meta: null,
    };
  }

  const domain = input.domain.replace(/^www\./, '');
  const byPlatform = { ...input.byPlatform };
  const social = [...input.social];
  const facebookPosts = [...input.facebookPosts];
  const crossPlatformPosts = { ...input.crossPlatformPosts };
  const queries = [...input.queries];
  const triedQueries = new Set(queries.map((q) => q.query.toLowerCase()));

  const maxRounds = config.presenceProbe.searchOrchestrateMaxRounds;
  const maxPerRound = config.presenceProbe.searchOrchestrateQueriesPerRound;
  let roundsRun = 0;
  let queriesAdded = 0;
  let stoppedReason = 'not started';

  let generalHitEstimate = input.generalHitEstimate;
  let offSiteDomainCount = input.offSiteDomainCount;

  for (let round = 1; round <= maxRounds; round++) {
    const gaps = detectSearchGaps({
      byPlatform,
      social,
      plan: input.searchPlan,
      generalHitEstimate,
      offSiteDomainCount,
    });
    if (gapsFullyFilled(gaps)) {
      stoppedReason = 'all gaps filled including web footprint';
      break;
    }

    const candidates = buildCurationCandidates({ byPlatform, social, queries });
    let orchestration: SearchOrchestrationOutput;

    try {
      const { data } = await ai.generateStructuredOutput({
        schema: SearchOrchestrationSchema,
        schemaName: 'SearchOrchestration',
        system: SEARCH_ORCHESTRATION_SYSTEM,
        prompt: buildSearchOrchestrationPrompt({
          brand: input.brand,
          domain,
          searchPlan: input.searchPlan,
          queriesTried: queries,
          gaps,
          generalHitEstimate,
          offSiteDomainCount,
          topCandidates: candidates,
          round,
          maxRounds,
        }),
        temperature: 0.2,
        ...(resolvePresenceModel(ai.name) ? { model: resolvePresenceModel(ai.name) } : {}),
      });
      orchestration = data;
    } catch (err) {
      logger.warn({ err: (err as Error).message, round }, 'search orchestration LLM failed');
      stoppedReason = 'LLM error';
      break;
    }

    roundsRun = round;
    stoppedReason = orchestration.reason;

    if (
      (orchestration.stop && !gaps.webFootprintWeak) ||
      orchestration.nextQueries.length === 0
    ) {
      break;
    }

    const newQueries = orchestration.nextQueries
      .map((q) => normalizeQuery(q, domain))
      .filter(
        (q) =>
          q &&
          !triedQueries.has(q.toLowerCase()) &&
          isQueryAllowedForPlan(q, input.searchPlan),
      )
      .slice(
        0,
        round === 1 && gaps.webFootprintWeak
          ? Math.max(maxPerRound, 5)
          : maxPerRound,
      );

    if (newQueries.length === 0) {
      stoppedReason = 'no new queries';
      break;
    }

    for (const query of newQueries) {
      triedQueries.add(query.toLowerCase());
      await input.limiter.wait();
      const { hits, engine } = await runBingDdgSearch(query, input.fetchPage, {
        httpOnly: input.serpHttpOnly ?? false,
        engines: input.serpHttpOnly ? ['bing'] : undefined,
      });
      const filtered = filterOwnSiteHits(hits, domain);
      queries.push({
        query,
        engine: engine ?? 'none',
        hitCount: filtered.length,
      });
      queriesAdded += 1;

      const classified = classifyHits(filtered, domain);
      mergeSupplementHits(byPlatform, classified.byPlatform);
      for (const s of classified.social) {
        if (!social.some((x) => x.url === s.url)) social.push(s);
      }
      mergeFacebookPostHits(facebookPosts, classified.facebookPosts);
      mergeCrossPlatformHits(crossPlatformPosts, classified.crossPlatformPosts);
      if (filtered.length > generalHitEstimate && !/\bsite:/i.test(query)) {
        generalHitEstimate = filtered.length;
      }
      offSiteDomainCount = countOffSiteDomains(byPlatform, social);
    }

    const gapsAfter = detectSearchGaps({
      byPlatform,
      social,
      plan: input.searchPlan,
      generalHitEstimate,
      offSiteDomainCount,
    });
    if (gapsFullyFilled(gapsAfter)) {
      stoppedReason = 'gaps filled after round';
      break;
    }
  }

  return {
    byPlatform,
    social,
    facebookPosts,
    crossPlatformPosts,
    queries,
    meta:
      roundsRun > 0 || queriesAdded > 0
        ? { roundsRun, queriesAdded, stoppedReason }
        : { roundsRun: 0, queriesAdded: 0, stoppedReason },
  };
}
