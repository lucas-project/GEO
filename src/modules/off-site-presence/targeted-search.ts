import { config } from '@shared/config';
import { isOwnDomain } from './supplement-helpers';
import { fetchRedditSearchPosts } from './platforms/reddit-json';
import { inferMarketFromDomain } from './market-country';
import {
  runBingDdgSearch,
  TOP_SEARCH_HITS,
  type SearchHit,
  type SearchSerpOptions,
} from './search-engine';
import type { FetchPageFn } from './platforms/types';
import type { PlatformId } from './schemas';

export type SupplementSearchTarget =
  | PlatformId
  | 'social'
  | 'social_facebook_posts'
  | 'general'
  | 'news'
  | 'vertical';

export interface QueryDefForSearch {
  key: string;
  target?: SupplementSearchTarget;
  verticalHost?: string;
  build: (brand: string, domain: string) => string;
}

const SOCIAL_SITE_HOSTS: Record<string, string> = {
  facebook: 'facebook.com',
  linkedin: 'linkedin.com',
  youtube: 'youtube.com',
  instagram: 'instagram.com',
  x: 'x.com',
};

const PLATFORM_SITE_HOSTS: Partial<Record<PlatformId, string>> = {
  quora: 'quora.com',
  g2: 'g2.com',
  capterra: 'capterra.com',
  trustpilot: 'trustpilot.com',
  reddit: 'reddit.com',
};

const HTTP_BING_ONLY: SearchSerpOptions = { httpOnly: true, engines: ['bing', 'duckduckgo'] };

function redditPostsToHits(
  domain: string,
  posts: Awaited<ReturnType<typeof fetchRedditSearchPosts>>,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const post of posts) {
    const url =
      post.url ??
      (post.subreddit
        ? `https://www.reddit.com/r/${post.subreddit}/comments/`
        : undefined);
    if (!url) continue;
    try {
      const host = new URL(url).hostname;
      if (isOwnDomain(host, domain)) continue;
    } catch {
      continue;
    }
    if (!/reddit\.com/i.test(url)) continue;
    hits.push({
      url,
      title: post.title,
      engine: 'bing',
    });
    if (hits.length >= TOP_SEARCH_HITS) break;
  }
  return hits;
}

async function searchRedditViaApi(
  brand: string,
  domain: string,
): Promise<{ hits: SearchHit[]; engine: string }> {
  const posts = await fetchRedditSearchPosts(brand);
  return { hits: redditPostsToHits(domain, posts), engine: 'reddit-json' };
}

async function searchViaBingSite(
  brand: string,
  domain: string,
  siteHost: string,
  fetchPage: FetchPageFn,
): Promise<{ hits: SearchHit[]; engine: string }> {
  const ex = domain.replace(/^www\./, '');
  const query = `"${brand}" site:${siteHost} -site:${ex}`;
  const { hits, engine } = await runBingDdgSearch(query, fetchPage, HTTP_BING_ONLY);
  return { hits, engine: engine ?? 'bing' };
}

async function searchViaBingGeneral(
  query: string,
  fetchPage: FetchPageFn,
): Promise<{ hits: SearchHit[]; engine: string }> {
  const { hits, engine } = await runBingDdgSearch(query, fetchPage, HTTP_BING_ONLY);
  return { hits, engine: engine ?? 'bing' };
}

/**
 * Route each supplement query to a platform-appropriate source instead of one DDG/Bing pipeline.
 */
export async function runQueryDefSearch(
  def: QueryDefForSearch,
  brand: string,
  domain: string,
  fetchPage: FetchPageFn,
): Promise<{ hits: SearchHit[]; engine: string; query: string }> {
  const query = def.build(brand, domain);
  const target = def.target;

  if (
    def.key === 'xiaohongshu' &&
    config.presenceProbe.agentReachEnabled &&
    config.presenceProbe.agentReachXhs
  ) {
    const { probeAgentReachHealth } = await import('./agent-reach/health');
    const { searchXiaohongshuViaCli } = await import('./agent-reach/xiaohongshu-search');
    const health = await probeAgentReachHealth();
    if (health.xhs === 'ok') {
      const market = inferMarketFromDomain(domain);
      const result = await searchXiaohongshuViaCli({
        brand,
        keywords: [brand],
        market,
      });
      return { ...result, engine: 'xhs-cli', query: result.query };
    }
  }

  if (
    def.key === 'reddit' &&
    config.presenceProbe.agentReachEnabled &&
    config.presenceProbe.agentReachRdt
  ) {
    const { probeAgentReachHealth } = await import('./agent-reach/health');
    const { searchRedditViaRdt } = await import('./agent-reach/reddit-rdt-search');
    const health = await probeAgentReachHealth();
    if (health.rdt === 'ok') {
      const result = await searchRedditViaRdt(brand, domain, [brand]);
      if (result.hits.length > 0) {
        return { ...result, engine: 'rdt-cli', query: result.query };
      }
    }
  }

  if (target === 'reddit') {
    const result = await searchRedditViaApi(brand, domain);
    return { ...result, query: `reddit-json:${brand}` };
  }

  if (target === 'quora' || target === 'g2' || target === 'capterra' || target === 'trustpilot') {
    const host = PLATFORM_SITE_HOSTS[target]!;
    const result = await searchViaBingSite(brand, domain, host, fetchPage);
    return { ...result, query };
  }

  if (target === 'social') {
    const socialKey = def.key.replace(/^social_/, '');
    const host = SOCIAL_SITE_HOSTS[socialKey];
    if (host) {
      const result = await searchViaBingSite(brand, domain, host, fetchPage);
      return { ...result, query };
    }
  }

  if (target === 'social_facebook_posts') {
    const result = await searchViaBingGeneral(query, fetchPage);
    return { ...result, query };
  }

  if (target === 'vertical' && def.verticalHost) {
    const result = await searchViaBingSite(brand, domain, def.verticalHost, fetchPage);
    return { ...result, query };
  }

  const result = await searchViaBingGeneral(query, fetchPage);
  return { ...result, query };
}
