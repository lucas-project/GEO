import { z } from 'zod';
import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { BrandEntityResult, PlatformId } from './schemas';
import type { SearchHit } from './search-engine';
import {
  classifyHits,
  type SearchSupplementSocialHit,
} from './supplement-helpers';
import {
  SEARCH_CURATION_SYSTEM,
  buildSearchCurationPrompt,
} from './prompts/search-curation';
import { resolvePresenceModel } from './model';

const MAX_CANDIDATES = 30;

export interface SearchCurationCandidate {
  url: string;
  title?: string;
  snippet?: string;
  platform?: string;
  sourceQuery?: string;
  engine?: SearchHit['engine'];
}

export const SearchHitCurationSchema = z.object({
  keep: z.array(
    z.object({
      url: z.string().url(),
      platform: z.string().optional(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  reject: z.array(
    z.object({
      url: z.string(),
      reason: z.string(),
    }),
  ),
});

export type SearchHitCurationOutput = z.infer<typeof SearchHitCurationSchema>;

export interface SearchSupplementCurationMeta {
  applied: boolean;
  provider: string;
  model: string;
  kept: number;
  rejected: number;
}

export interface CurationApplyResult {
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  meta: SearchSupplementCurationMeta;
}

export function shouldCurateSearchHits(): boolean {
  return (
    config.presenceProbe.searchCurateEnabled && config.ai.provider !== 'mock'
  );
}

/** Flatten supplement buckets into deduped candidates for the LLM. */
export function buildCurationCandidates(input: {
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  queries: { query: string }[];
}): SearchCurationCandidate[] {
  const byUrl = new Map<string, SearchCurationCandidate>();
  const queryHint = input.queries[0]?.query;

  for (const [platformId, hits] of Object.entries(input.byPlatform) as [
    PlatformId,
    SearchHit[],
  ][]) {
    for (const h of hits ?? []) {
      if (byUrl.has(h.url)) continue;
      byUrl.set(h.url, {
        url: h.url,
        title: h.title,
        snippet: h.snippet,
        platform: platformId,
        sourceQuery: queryHint,
        engine: h.engine,
      });
    }
  }

  for (const s of input.social) {
    if (byUrl.has(s.url)) continue;
    byUrl.set(s.url, {
      url: s.url,
      title: s.title,
      platform: s.platform,
      sourceQuery: queryHint,
    });
  }

  return [...byUrl.values()].slice(0, MAX_CANDIDATES);
}

/** Rebuild platform/social lists from LLM keep decisions (sorted by confidence). */
export function applyCurationResult(
  output: SearchHitCurationOutput,
  candidates: SearchCurationCandidate[],
  domain: string,
  meta: Pick<SearchSupplementCurationMeta, 'provider' | 'model'>,
): CurationApplyResult {
  const candidateByUrl = new Map(candidates.map((c) => [c.url, c]));
  const keptUrls = new Set<string>();

  const sortedKeep = [...output.keep]
    .filter((k) => candidateByUrl.has(k.url))
    .sort((a, b) => b.confidence - a.confidence);

  const hits: SearchHit[] = [];
  for (const k of sortedKeep) {
    keptUrls.add(k.url);
    const c = candidateByUrl.get(k.url)!;
    hits.push({
      url: k.url,
      title: c.title,
      snippet: c.snippet,
      engine: c.engine ?? 'bing',
    });
  }

  const { byPlatform, social } = classifyHits(hits, domain);

  return {
    byPlatform,
    social,
    meta: {
      applied: true,
      provider: meta.provider,
      model: meta.model,
      kept: sortedKeep.length,
      rejected: output.reject.filter((r) => candidateByUrl.has(r.url)).length,
    },
  };
}

export interface CurateSearchHitsInput {
  brand: BrandEntityResult;
  domain: string;
  siteKeywords?: string[];
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  queries: { query: string }[];
}

export async function curateSearchHits(
  input: CurateSearchHitsInput,
): Promise<CurationApplyResult | null> {
  if (!shouldCurateSearchHits()) return null;

  const candidates = buildCurationCandidates({
    byPlatform: input.byPlatform,
    social: input.social,
    queries: input.queries,
  });

  if (candidates.length === 0) return null;

  try {
    const { data, provider, model } = await ai.generateStructuredOutput({
      schema: SearchHitCurationSchema,
      schemaName: 'SearchHitCuration',
      system: SEARCH_CURATION_SYSTEM,
      prompt: buildSearchCurationPrompt({
        brand: input.brand,
        domain: input.domain,
        siteKeywords: input.siteKeywords,
        candidates,
      }),
      temperature: 0.1,
      ...(resolvePresenceModel(ai.name) ? { model: resolvePresenceModel(ai.name) } : {}),
    });

    return applyCurationResult(data, candidates, input.domain, { provider, model });
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'search hit curation failed; using rule-based supplement',
    );
    return null;
  }
}
