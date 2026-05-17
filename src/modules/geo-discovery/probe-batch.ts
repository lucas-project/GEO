import { config } from '@shared/config';
import { crawlSinglePage } from '@modules/crawling';
import { extractDiscoveryProbeSignals } from '@modules/extraction';
import { mergeProbeScore, scoreHeuristic } from './score';
import type { DiscoveryCandidate, DiscoveryProgressCallback, GeoDiscoveredPage } from './types';

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

export async function probeCandidates(
  siteUrl: string,
  candidates: DiscoveryCandidate[],
  onProgress?: DiscoveryProgressCallback,
): Promise<GeoDiscoveredPage[]> {
  const probeCount = config.discovery.probeCount;
  const concurrency = config.discovery.probeConcurrency;
  const scored = buildHeuristicPages(siteUrl, candidates);

  if (probeCount <= 0) {
    return scored.map(({ candidate, heuristic }) => toPage(candidate, heuristic, null));
  }

  const toProbe = new Set(scored.slice(0, probeCount).map((x) => x.candidate.url));
  const probeResults = new Map<string, ReturnType<typeof extractDiscoveryProbeSignals>>();
  const probeList = scored.filter((x) => toProbe.has(x.candidate.url));
  let done = 0;

  for (let i = 0; i < probeList.length; i += concurrency) {
    const batch = probeList.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ candidate }) => {
        onProgress?.(
          `Ranking pages for audit priority (${done + 1}/${probeList.length})…`,
        );
        try {
          const page = await crawlSinglePage(candidate.url, {
            timeoutMs: config.crawl.timeoutMs,
            screenshot: false,
            auditId: 'geo-discover',
          });
          const html = page.renderedHtml ?? page.html;
          if (html) {
            probeResults.set(candidate.url, extractDiscoveryProbeSignals(html));
          }
          if (page.title) candidate.title = page.title;
        } catch {
          /* probe failure — keep heuristic score */
        }
        done++;
      }),
    );
  }

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
