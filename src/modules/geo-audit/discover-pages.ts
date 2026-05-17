/**
 * Lightweight page discovery before a full audit (root render + sitemap + internal links).
 */

import { config } from '@shared/config';
import { canonicalPageUrl, normalizeWebsiteUrl } from '@/lib/website-url';
import {
  buildCrawlQueue,
  crawlSinglePage,
  discoverInternalLinks,
  fetchRobots,
  fetchSitemap,
  discoverSitemaps,
} from '@modules/crawling';
import type { AuditPageEntry } from './schemas';

export interface DiscoverAuditPagesResult {
  url: string;
  pages: AuditPageEntry[];
  suggestedUrls: string[];
  maxSelectable: number;
}

export async function discoverAuditPages(rawUrl: string): Promise<DiscoverAuditPagesResult> {
  const url = normalizeWebsiteUrl(rawUrl);
  const maxSelectable = config.crawl.maxPages;

  const robots = await fetchRobots(url);
  let sitemapUrls = robots.sitemaps;
  if (sitemapUrls.length === 0) sitemapUrls = await discoverSitemaps(url);

  const sitemap: { loc: string }[] = [];
  for (const sm of sitemapUrls.slice(0, 3)) {
    const entries = await fetchSitemap(sm, 50);
    sitemap.push(...entries);
  }

  const rootPage = await crawlSinglePage(url, {
    timeoutMs: config.crawl.timeoutMs,
    screenshot: false,
    auditId: 'discover',
  });

  const rootFinal = canonicalPageUrl(rootPage.finalUrl || url, url);
  const internalLinks =
    rootPage.renderedHtml != null
      ? discoverInternalLinks(rootPage.renderedHtml, url, 80)
      : [];

  const suggestedUrls = buildCrawlQueue(
    url,
    sitemap.map((e) => e.loc),
    internalLinks,
    maxSelectable,
  );

  const byUrl = new Map<string, AuditPageEntry>();
  const upsert = (pageUrl: string, source: AuditPageEntry['source'], patch?: Partial<AuditPageEntry>) => {
    const key = canonicalPageUrl(pageUrl, url);
    const existing = byUrl.get(key);
    byUrl.set(key, {
      url: key,
      source: existing?.source ?? source,
      title: patch?.title ?? existing?.title ?? null,
      statusCode: patch?.statusCode ?? existing?.statusCode,
      audited: false,
      error: patch?.error ?? existing?.error ?? null,
    });
  };

  upsert(rootFinal, 'seed', {
    title: rootPage.title,
    statusCode: rootPage.statusCode,
    error: rootPage.error,
  });

  for (const entry of sitemap) {
    if (!entry.loc || entry.loc.endsWith('.xml')) continue;
    upsert(entry.loc, 'sitemap');
  }

  for (const link of internalLinks) {
    upsert(link, 'internal');
  }

  const pages = [...byUrl.values()].sort((a, b) => {
    const order = { seed: 0, sitemap: 1, internal: 2 } as const;
    if (order[a.source] !== order[b.source]) return order[a.source] - order[b.source];
    return a.url.localeCompare(b.url);
  });

  return {
    url,
    pages,
    suggestedUrls: [rootFinal, ...suggestedUrls.filter((u) => u !== rootFinal)].slice(0, maxSelectable),
    maxSelectable,
  };
}
