import { config } from '@shared/config';
import type { BrandEntityResult } from '../schemas';
import type { SearchSupplementResult } from '../search-supplement';
import type { SearchHit } from '../search-engine';
import { mergeCrossPlatformHits, platformHitCap } from '../supplement-helpers';
import type { CrossPlatformPresencePlatform } from '../cross-platform-posts';
import { inferMarketFromDomain } from '../market-country';
import { probeAgentReachHealth } from './health';
import { enrichZhihuHitsWithJina } from './jina-zhihu';
import { searchRedditViaRdt } from './reddit-rdt-search';
import type { AgentReachHealth } from '../schemas';
import { searchXiaohongshuViaCli } from './xiaohongshu-search';

export interface EnrichSupplementInput {
  brand: BrandEntityResult;
  domain: string;
  keywords: string[];
}

function mergePlatformHits(
  target: Partial<Record<string, SearchHit[]>>,
  platform: string,
  incoming: SearchHit[],
): void {
  const cap = platformHitCap(platform);
  const existing = target[platform as keyof typeof target] ?? [];
  const seen = new Set(existing.map((h) => h.url));
  const merged = [...existing];
  for (const h of incoming) {
    if (seen.has(h.url) || merged.length >= cap) continue;
    seen.add(h.url);
    merged.push(h);
  }
  target[platform as keyof typeof target] = merged.slice(0, cap);
}

export async function enrichSearchSupplementWithAgentReach(
  supplement: SearchSupplementResult,
  input: EnrichSupplementInput,
): Promise<SearchSupplementResult> {
  if (!config.presenceProbe.agentReachEnabled) return supplement;

  const health = await probeAgentReachHealth();
  const brandLabel =
    input.brand.confidence < 0.7 && input.brand.aliases[0]
      ? input.brand.aliases[0]
      : input.brand.primaryBrand;
  const market = inferMarketFromDomain(input.domain);
  const resultHealth: AgentReachHealth = { ...health };
  const queries = [...supplement.queries];
  let crossPlatformPosts = { ...supplement.crossPlatformPosts };
  const byPlatform = { ...supplement.byPlatform };

  if (config.presenceProbe.agentReachXhs && health.xhs === 'ok') {
    const { hits, query } = await searchXiaohongshuViaCli({
      brand: brandLabel,
      keywords: input.keywords,
      market,
    });
    if (hits.length > 0) {
      mergeCrossPlatformHits(crossPlatformPosts, {
        xiaohongshu: hits,
      } as Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>);
      resultHealth.xhsHitsAdded = hits.length;
      queries.push({ query, engine: 'xhs-cli', hitCount: hits.length });
    }
  }

  if (config.presenceProbe.agentReachRdt && health.rdt === 'ok') {
    const { hits, query } = await searchRedditViaRdt(brandLabel, input.domain, input.keywords);
    if (hits.length > 0) {
      mergePlatformHits(byPlatform, 'reddit', hits);
      resultHealth.rdtHitsAdded = hits.length;
      queries.push({ query, engine: 'rdt-cli', hitCount: hits.length });
    }
  }

  if (config.presenceProbe.agentReachJina && health.jina === 'ok') {
    const zhihuHits = crossPlatformPosts.zhihu ?? [];
    if (zhihuHits.length > 0) {
      const { hits, enriched } = await enrichZhihuHitsWithJina(zhihuHits);
      crossPlatformPosts = { ...crossPlatformPosts, zhihu: hits };
      resultHealth.jinaEnriched = enriched;
      if (enriched > 0) {
        queries.push({
          query: `jina:zhihu:${input.domain}`,
          engine: 'jina',
          hitCount: enriched,
        });
      }
    }
  }

  return {
    ...supplement,
    queries,
    byPlatform,
    crossPlatformPosts,
    agentReach: resultHealth,
  };
}
