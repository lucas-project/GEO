import { config } from '@shared/config';
import { mapPool } from '@/lib/map-pool';
import { canonicalPageUrl } from '@/lib/website-url';
import { crawlSinglePage } from '@modules/crawling/server';
import { extractDiscoveryProbeSignals } from '@modules/extraction';
import { mergeProbeScore, scoreHeuristic } from './score';
import type { DiscoveryCandidate, DiscoveryProgressCallback, GeoDiscoveredPage } from './types';

export interface PrefetchedProbePage {
  html: string;
  title: string | null;
  signals: ReturnType<typeof extractDiscoveryProbeSignals> | null;
}

function buildHeuristicPages(
  siteUrl: string,
  candidates: DiscoveryCandidate[],
): { candidate: DiscoveryCandidate; heuristic: ReturnType<typeof scoreHeuristic> }[] {
  return candidates
    .map((candidate) => ({
      candidate,
      heuristic: scoreHeuristic({ candidate, siteRoot: siteUrl }),
    }))
    .filter((x) => x.heuristic.score > 0)
    .sort((a, b) => b.heuristic.score - a.heuristic.score);
}

export interface ProbeCandidatesOptions {
  prefetched?: Map<string, PrefetchedProbePage>;
  probeTimeoutMs?: number;
  isAllowedByRobots?: (url: string) => boolean;
}

export async function probeCandidates(
  siteUrl: string,
  candidates: DiscoveryCandidate[],
  onProgress?: DiscoveryProgressCallback,
  options: ProbeCandidatesOptions = {},
): Promise<GeoDiscoveredPage[]> {
  const probeCount = config.discovery.probeCount;
  const concurrency = config.discovery.probeConcurrency;
  const probeTimeoutMs = options.probeTimeoutMs ?? config.discovery.probeTimeoutMs;
  const prefetched = options.prefetched ?? new Map<string, PrefetchedProbePage>();
  const scored = buildHeuristicPages(siteUrl, candidates);

  if (probeCount <= 0) {
    return scored.map(({ candidate, heuristic }) => toPage(candidate, heuristic, null));
  }

  const eligible = options.isAllowedByRobots
    ? scored.filter(({ candidate }) => options.isAllowedByRobots!(candidate.url))
    : scored;
  const toProbe = new Set(eligible.slice(0, probeCount).map((x) => x.candidate.url));
  const probeResults = new Map<string, ReturnType<typeof extractDiscoveryProbeSignals>>();
  const probeList = scored.filter((x) => toProbe.has(x.candidate.url));

  await mapPool(probeList, concurrency, async ({ candidate }, index) => {
    const canon = canonicalPageUrl(candidate.url, siteUrl);
    const cached = prefetched.get(canon) ?? prefetched.get(candidate.url);

    onProgress?.(`Ranking pages for audit priority (${index + 1}/${probeList.length})…`);

    try {
      if (cached?.html) {
        probeResults.set(
          candidate.url,
          cached.signals ?? extractDiscoveryProbeSignals(cached.html),
        );
        if (cached.title) candidate.title = cached.title;
      } else {
        let page = await crawlSinglePage(candidate.url, {
          timeoutMs: probeTimeoutMs,
          screenshot: false,
          auditId: 'geo-discover',
          profile: 'discovery',
        });
        if (page.error?.includes('Timeout') && probeTimeoutMs < 35_000) {
          page = await crawlSinglePage(candidate.url, {
            timeoutMs: Math.round(probeTimeoutMs * 1.5),
            screenshot: false,
            auditId: 'geo-discover-retry',
            profile: 'discovery',
          });
        }
        const html = page.renderedHtml ?? page.html;
        if (html) {
          probeResults.set(candidate.url, extractDiscoveryProbeSignals(html));
        }
        if (page.title) candidate.title = page.title;
      }
    } catch {
      /* probe failure — keep heuristic score */
    }
  });

  return scored.map(({ candidate, heuristic }) => {
    const probe = probeResults.get(candidate.url) ?? null;
    return toPage(candidate, heuristic, probe);
  });
}

function toPage(
  candidate: DiscoveryCandidate,
  heuristic: ReturnType<typeof scoreHeuristic>,
  probe: ReturnType<typeof extractDiscoveryProbeSignals> | null,
): GeoDiscoveredPage {
  const merged = mergeProbeScore(heuristic, probe);
  return {
    url: candidate.url,
    title: candidate.title,
    source: pickPrimarySource(candidate.sources),
    sources: [...candidate.sources],
    audited: false,
    error: null,
    geoScore: merged.score,
    archetype: heuristic.archetype,
    signals: merged.signals,
    probed: probe !== null,
  };
}

function pickPrimarySource(
  sources: Set<import('@modules/geo-audit/schemas').DiscoverySource>,
): GeoDiscoveredPage['source'] {
  const order: GeoDiscoveredPage['source'][] = [
    'seed',
    'llms',
    'graph',
    'internal',
    'sitemap',
  ];
  for (const s of order) {
    if (sources.has(s)) return s;
  }
  return 'sitemap';
}
