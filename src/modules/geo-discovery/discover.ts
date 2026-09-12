/**
 * Two-stage GEO-aware discovery orchestrator.
 * Stage 1: broad semantic candidate collection
 * Stage 2: heuristic ranking + Playwright probe of top candidates
 */

import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import { mapPool } from '@/lib/map-pool';
import { canonicalPageUrl, normalizeWebsiteUrl } from '@/lib/website-url';
import {
  discoverSitemaps,
  fetchRobots,
  fetchSitemapRecursive,
  isAccessDeniedBySite,
  isParkedDomainPage,
  parkedDomainMessage,
  walledGardenDiscoverMessage,
} from '@modules/crawling';
import { crawlSinglePage } from '@modules/crawling/server';
import { mergeCandidates } from './collectors/candidates';
import { collectLlmsUrls } from './collectors/llms';
import { discoverNavLinks } from './collectors/nav';
import { probeCandidates, type PrefetchedProbePage } from './probe-batch';
import type { DiscoverGeoPagesResult, DiscoveryProgressCallback } from './types';

const probeTimeout = () => config.discovery.probeTimeoutMs;
const hubTimeout = () => Math.min(config.crawl.timeoutMs, 20_000);

export async function discoverGeoPages(
  rawUrl: string,
  onProgress?: DiscoveryProgressCallback,
): Promise<DiscoverGeoPagesResult> {
  const started = Date.now();
  const url = normalizeWebsiteUrl(rawUrl);
  const maxSelectable = config.crawl.maxPages;
  const deadline = started + config.discovery.timeoutMs;
  const prefetched = new Map<string, PrefetchedProbePage>();

  const checkDeadline = () => {
    if (Date.now() > deadline) {
      crawlLogger.warn({ url }, 'discovery timeout approaching');
    }
  };

  onProgress?.('Fetching robots.txt and rendering homepage…');
  const [robots, rootPage] = await Promise.all([
    fetchRobots(url),
    crawlSinglePage(url, {
      timeoutMs: hubTimeout(),
      screenshot: false,
      auditId: 'geo-discover',
      profile: 'hub',
    }),
  ]);

  const rootFinal = canonicalPageUrl(rootPage.finalUrl || url, url);
  const rootHtml = rootPage.renderedHtml ?? rootPage.html ?? '';
  if (
    isAccessDeniedBySite({
      statusCode: rootPage.statusCode,
      html: rootHtml || rootPage.html,
      title: rootPage.title,
    })
  ) {
    throw new Error(walledGardenDiscoverMessage(url));
  }
  if (isParkedDomainPage({ html: rootHtml || rootPage.html, title: rootPage.title })) {
    throw new Error(parkedDomainMessage(url));
  }
  if (rootHtml) {
    prefetched.set(rootFinal, {
      html: rootHtml,
      title: rootPage.title,
      signals: null,
    });
  }

  let sitemapRoots = robots.sitemaps;
  if (sitemapRoots.length === 0) sitemapRoots = await discoverSitemaps(url);

  onProgress?.('Reading sitemaps and llms.txt…');
  const [sitemap, llmsUrls] = await Promise.all([
    fetchSitemapRecursive(sitemapRoots, {
      maxFiles: config.discovery.maxSitemapFiles,
      maxUrls: config.discovery.maxSitemapUrls,
      maxDepth: 3,
    }),
    collectLlmsUrls(url),
  ]);

  checkDeadline();

  const navLinks = rootHtml ? discoverNavLinks(rootHtml, url, 120) : [];

  const graphLinkMap = new Map<string, ReturnType<typeof discoverNavLinks>[number]>();
  const bfsTargets = navLinks
    .filter((l) => l.url !== rootFinal)
    .slice(0, config.discovery.linkGraphMaxPages);

  if (bfsTargets.length > 0 && Date.now() < deadline) {
    onProgress?.(`Exploring ${bfsTargets.length} navigation hubs…`);
    await mapPool(
      bfsTargets,
      config.discovery.linkGraphConcurrency,
      async (target) => {
        if (Date.now() > deadline) return;
        try {
          const page = await crawlSinglePage(target.url, {
            timeoutMs: hubTimeout(),
            screenshot: false,
            auditId: 'geo-discover-graph',
            profile: 'hub',
          });
          const html = page.renderedHtml ?? page.html;
          if (html) {
            const canon = canonicalPageUrl(page.finalUrl || target.url, url);
            prefetched.set(canon, { html, title: page.title, signals: null });
            for (const hit of discoverNavLinks(html, url, 40)) {
              graphLinkMap.set(hit.url, hit);
            }
          }
        } catch {
          /* skip failed BFS node */
        }
      },
    );
  }

  const candidateMap = mergeCandidates(
    url,
    {
      seedUrl: rootFinal,
      sitemap,
      navLinks,
      llmsUrls,
      graphUrls: [...graphLinkMap.values()],
    },
    config.discovery.maxCandidates,
  );

  const seedCandidate = candidateMap.get(rootFinal);
  if (seedCandidate) {
    seedCandidate.title = rootPage.title ?? seedCandidate.title;
  }

  checkDeadline();
  onProgress?.(`Ranking ${candidateMap.size} discovered pages…`);

  const rankedPages = await probeCandidates(url, [...candidateMap.values()], onProgress, {
    prefetched,
    probeTimeoutMs: probeTimeout(),
  });

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
