/**
 * Build the page inventory shown at the top of audit reports.
 */

import type { CrawlResult } from '@modules/crawling';
import { scorePagePriority } from '@modules/geo-discovery';
import { canonicalPageUrl, sameTargetSite } from '@/lib/website-url';
import type { AuditPageEntry, PageInventory } from './schemas';
import { selectAuditRootPage } from './root-page';

export type PagePriorityHint = Pick<
  AuditPageEntry,
  'url' | 'geoScore' | 'archetype' | 'signals' | 'probed'
>;

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
      observationStatus: patch?.observationStatus ?? existing?.observationStatus,
    });
  };

  const root = selectAuditRootPage(crawl.pages, rootUrl);
  const rootFinal = root?.finalUrl || rootUrl;
  upsert(rootFinal, 'seed', {
    title: root?.title ?? null,
    statusCode: root?.statusCode,
    error: root?.error,
    observationStatus: root?.fetchStatus,
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
      observationStatus: page.fetchStatus,
    });
  }

  const inventory: PageInventory = {
    pages: [...byUrl.values()],
    auditedCount: 0,
    discoveredCount: byUrl.size,
  };
  inventory.auditedCount = inventory.pages.filter((p) => p.audited).length;
  return sortPageInventory(inventory);
}

/** Attach GEO audit priority scores and sort by priority within audited / discovered groups. */
export function applyGeoPriorityToInventory(
  inventory: PageInventory,
  rootUrl: string,
  hints?: PagePriorityHint[],
): PageInventory {
  const hintByUrl = new Map<string, PagePriorityHint>();
  for (const hint of hints ?? []) {
    hintByUrl.set(canonicalPageUrl(hint.url, rootUrl), hint);
  }

  const pages = inventory.pages.map((page) => {
    const key = canonicalPageUrl(page.url, rootUrl);
    const hint = hintByUrl.get(key);
    if (hint?.geoScore != null) {
      return {
        ...page,
        geoScore: hint.geoScore,
        archetype: hint.archetype ?? page.archetype,
        signals: hint.signals ?? page.signals,
        probed: hint.probed ?? page.probed,
      };
    }

    const ranked = scorePagePriority({
      url: page.url,
      siteRoot: rootUrl,
      source: page.source,
      title: page.title,
    });
    if (ranked.geoScore <= 0) return page;
    return {
      ...page,
      geoScore: ranked.geoScore,
      archetype: ranked.archetype,
      signals: ranked.signals,
    };
  });

  return sortPageInventory({ ...inventory, pages });
}

function sortPageInventory(inventory: PageInventory): PageInventory {
  const pages = [...inventory.pages].sort((a, b) => {
    if (a.audited !== b.audited) return a.audited ? -1 : 1;
    const scoreDiff = (b.geoScore ?? 0) - (a.geoScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const sourceRank: Record<string, number> = {
      seed: 0,
      llms: 1,
      graph: 2,
      internal: 3,
      sitemap: 4,
    };
    const ra = sourceRank[a.source] ?? 5;
    const rb = sourceRank[b.source] ?? 5;
    if (ra !== rb) return ra - rb;
    return a.url.localeCompare(b.url);
  });

  return { ...inventory, pages };
}
