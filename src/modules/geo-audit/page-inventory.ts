/**
 * Build the page inventory shown at the top of audit reports.
 */

import type { CrawlResult } from '@modules/crawling';
import { canonicalPageUrl, sameTargetSite } from '@/lib/website-url';
import type { AuditPageEntry, PageInventory } from './schemas';

export function buildPageInventory(input: {
  rootUrl: string;
  crawl: CrawlResult;
  internalLinks: string[];
  auditedUrls: Set<string>;
}): PageInventory {
  const { rootUrl, crawl, internalLinks, auditedUrls } = input;
  const byUrl = new Map<string, AuditPageEntry>();

  const upsert = (
    url: string,
    source: AuditPageEntry['source'],
    patch?: Partial<AuditPageEntry>,
  ) => {
    if (!sameTargetSite(url, rootUrl)) return;
    const key = canonicalPageUrl(url, rootUrl);
    const existing = byUrl.get(key);
    const audited =
      auditedUrls.has(key) ||
      auditedUrls.has(url) ||
      [...auditedUrls].some((u) => canonicalPageUrl(u, rootUrl) === key) ||
      existing?.audited === true;
    byUrl.set(key, {
      url: key,
      source: existing?.source ?? source,
      title: patch?.title ?? existing?.title ?? null,
      statusCode: patch?.statusCode ?? existing?.statusCode,
      audited,
      error: patch?.error ?? existing?.error ?? null,
    });
  };

  const root = crawl.pages[0];
  const rootFinal = root?.finalUrl || rootUrl;
  upsert(rootFinal, 'seed', {
    title: root?.title ?? null,
    statusCode: root?.statusCode,
    error: root?.error,
  });

  for (const entry of crawl.sitemap) {
    if (!entry.loc || entry.loc.endsWith('.xml')) continue;
    upsert(entry.loc, 'sitemap');
  }

  for (const link of internalLinks) {
    upsert(link, 'internal');
  }

  for (const page of crawl.pages) {
    const u = page.finalUrl || page.url;
    upsert(u, u === rootFinal ? 'seed' : 'sitemap', {
      title: page.title,
      statusCode: page.statusCode,
      error: page.error,
    });
  }

  const pages = [...byUrl.values()].sort((a, b) => {
    if (a.audited !== b.audited) return a.audited ? -1 : 1;
    const order = { seed: 0, sitemap: 1, internal: 2 } as const;
    if (order[a.source] !== order[b.source]) return order[a.source] - order[b.source];
    return a.url.localeCompare(b.url);
  });

  return {
    pages,
    auditedCount: pages.filter((p) => p.audited).length,
    discoveredCount: pages.length,
  };
}
