/**
 * Two-stage GEO-aware discovery orchestrator.
 * Stage 1: broad semantic candidate collection
 * Stage 2: heuristic ranking + Playwright probe of top candidates
 */

import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import { canonicalPageUrl, normalizeWebsiteUrl } from '@/lib/website-url';
import {
  crawlSinglePage,
  discoverSitemaps,
  fetchRobots,
  fetchSitemapRecursive,
} from '@modules/crawling';
import { mergeCandidates } from './collectors/candidates';
import { collectLlmsUrls } from './collectors/llms';
import { discoverNavLinks } from './collectors/nav';
import { probeCandidates } from './probe-batch';
import type { DiscoverGeoPagesResult, DiscoveryProgressCallback } from './types';

export async function discoverGeoPages(
  rawUrl: string,
  onProgress?: DiscoveryProgressCallback,
): Promise<DiscoverGeoPagesResult> {
  const started = Date.now();
  const url = normalizeWebsiteUrl(rawUrl);
  const maxSelectable = config.crawl.maxPages;
  const deadline = started + config.discovery.timeoutMs;

  const checkDeadline = () => {
    if (Date.now() > deadline) {
      crawlLogger.warn({ url }, 'discovery timeout approaching');
    }
  };

  onProgress?.('Fetching robots.txt and sitemaps…');
  const robots = await fetchRobots(url);
  let sitemapRoots = robots.sitemaps;
  if (sitemapRoots.length === 0) sitemapRoots = await discoverSitemaps(url);

  const [sitemap, llmsUrls] = await Promise.all([
    fetchSitemapRecursive(sitemapRoots, {
      maxFiles: config.discovery.maxSitemapFiles,
      maxUrls: config.discovery.maxSitemapUrls,
      maxDepth: 3,
    }),
    collectLlmsUrls(url),
  ]);

  checkDeadline();
  onProgress?.('Rendering homepage…');
  const rootPage = await crawlSinglePage(url, {
    timeoutMs: config.crawl.timeoutMs,
    screenshot: false,
    auditId: 'geo-discover',
  });

  const rootFinal = canonicalPageUrl(rootPage.finalUrl || url, url);
  const rootHtml = rootPage.renderedHtml ?? rootPage.html ?? '';

  const navLinks = rootHtml ? discoverNavLinks(rootHtml, url, 120) : [];

  const graphLinks: ReturnType<typeof discoverNavLinks> = [];
  const bfsTargets = navLinks
    .filter((l) => l.url !== rootFinal)
    .slice(0, config.discovery.linkGraphMaxPages);

  if (bfsTargets.length > 0 && Date.now() < deadline) {
    onProgress?.(`Exploring ${bfsTargets.length} navigation hubs…`);
    for (const target of bfsTargets) {
      if (Date.now() > deadline) break;
      try {
        const page = await crawlSinglePage(target.url, {
          timeoutMs: config.crawl.timeoutMs,
          screenshot: false,
          auditId: 'geo-discover-graph',
        });
        const html = page.renderedHtml ?? page.html;
        if (html) {
          const childLinks = discoverNavLinks(html, url, 40);
          for (const hit of childLinks) {
            if (!graphLinks.some((g) => g.url === hit.url)) graphLinks.push(hit);
          }
        }
      } catch {
        /* skip failed BFS node */
      }
    }
  }

  const candidateMap = mergeCandidates(
    url,
    {
      seedUrl: rootFinal,
      sitemap,
      navLinks,
      llmsUrls,
      graphUrls: graphLinks,
    },
    config.discovery.maxCandidates,
  );

  const seedCandidate = candidateMap.get(rootFinal);
  if (seedCandidate) {
    seedCandidate.title = rootPage.title ?? seedCandidate.title;
  }

  checkDeadline();
  onProgress?.(`Ranking ${candidateMap.size} discovered pages…`);

  const rankedPages = await probeCandidates(url, [...candidateMap.values()], onProgress);

  rankedPages.sort((a, b) => {
    const aHome = a.url === rootFinal ? 1 : 0;
    const bHome = b.url === rootFinal ? 1 : 0;
    if (aHome !== bHome) return bHome - aHome;
    return b.geoScore - a.geoScore;
  });

  const suggestedUrls = buildSuggestedUrls(rootFinal, rankedPages, maxSelectable);

  const durationMs = Date.now() - started;
  crawlLogger.info(
    {
      url,
      discovered: rankedPages.length,
      probed: rankedPages.filter((p) => p.probed).length,
      durationMs,
    },
    'geo discovery complete',
  );

  return {
    url,
    pages: rankedPages,
    suggestedUrls,
    maxSelectable,
    discoveredCount: rankedPages.length,
    probedCount: rankedPages.filter((p) => p.probed).length,
  };
}

function buildSuggestedUrls(
  rootFinal: string,
  pages: { url: string; geoScore: number }[],
  maxSelectable: number,
): string[] {
  const ordered = pages
    .filter((p) => p.url !== rootFinal)
    .sort((a, b) => b.geoScore - a.geoScore)
    .map((p) => p.url);

  const picked = [rootFinal, ...ordered].slice(0, maxSelectable);
  const seen = new Set<string>();
  return picked.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}
