import { canonicalPageUrl, normalizeWebsiteUrl } from '@/lib/website-url';
import type { DiscoverySource } from '@modules/geo-audit/schemas';
import type { SitemapEntry } from '@modules/crawling';
import type { DiscoveryCandidate } from '../types';
import type { NavLinkHit } from './nav';

export function mergeCandidates(
  siteUrl: string,
  input: {
    seedUrl: string;
    sitemap: SitemapEntry[];
    navLinks: NavLinkHit[];
    llmsUrls: string[];
    graphUrls: NavLinkHit[];
  },
  maxCandidates: number,
): Map<string, DiscoveryCandidate> {
  const root = normalizeWebsiteUrl(siteUrl);
  const byUrl = new Map<string, DiscoveryCandidate>();

  const upsert = (
    rawUrl: string,
    source: DiscoverySource,
    patch?: Partial<Pick<DiscoveryCandidate, 'navWeight' | 'anchorTexts' | 'lastmod' | 'title'>>,
  ) => {
    const url = canonicalPageUrl(rawUrl, root);
    const existing = byUrl.get(url);
    const sources = new Set(existing?.sources ?? []);
    sources.add(source);

    const anchorTexts = [...(existing?.anchorTexts ?? [])];
    if (patch?.anchorTexts?.length) {
      for (const t of patch.anchorTexts) {
        if (t && !anchorTexts.includes(t)) anchorTexts.push(t);
      }
    }

    byUrl.set(url, {
      url,
      sources,
      navWeight: Math.max(existing?.navWeight ?? 0, patch?.navWeight ?? 0),
      anchorTexts,
      lastmod: patch?.lastmod ?? existing?.lastmod ?? null,
      title: patch?.title ?? existing?.title ?? null,
    });
  };

  upsert(input.seedUrl, 'seed', { navWeight: 10, anchorTexts: ['home'] });

  for (const entry of input.sitemap) {
    if (!entry.loc || entry.loc.endsWith('.xml')) continue;
    upsert(entry.loc, 'sitemap', { lastmod: entry.lastmod ?? null });
  }

  for (const hit of input.navLinks) {
    upsert(hit.url, 'internal', {
      navWeight: hit.weight,
      anchorTexts: hit.anchorText ? [hit.anchorText] : [],
    });
  }

  for (const url of input.llmsUrls) {
    upsert(url, 'llms');
  }

  for (const hit of input.graphUrls) {
    upsert(hit.url, 'graph', {
      navWeight: hit.weight,
      anchorTexts: hit.anchorText ? [hit.anchorText] : [],
    });
  }

  if (maxCandidates > 0 && byUrl.size > maxCandidates) {
    const sorted = [...byUrl.values()].sort((a, b) => {
      const scoreA = a.navWeight + a.sources.size * 3 + (a.lastmod ? 2 : 0);
      const scoreB = b.navWeight + b.sources.size * 3 + (b.lastmod ? 2 : 0);
      return scoreB - scoreA;
    });
    const trimmed = new Map<string, DiscoveryCandidate>();
    for (const c of sorted.slice(0, maxCandidates)) {
      trimmed.set(c.url, c);
    }
    return trimmed;
  }

  return byUrl;
}
