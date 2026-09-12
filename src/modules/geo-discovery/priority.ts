import type { DiscoverySource, PageArchetype } from '@modules/geo-audit/schemas';
import { classifyUrl } from './classify-url';
import { scoreHeuristic } from './score';
import type { DiscoveryCandidate } from './types';

const SOURCE_NAV_WEIGHT: Record<DiscoverySource, number> = {
  seed: 10,
  internal: 5,
  graph: 5,
  llms: 8,
  sitemap: 0,
};

/** Heuristic GEO audit priority for a URL (no Playwright probe). */
export function scorePagePriority(input: {
  url: string;
  siteRoot: string;
  source: DiscoverySource;
  title?: string | null;
}): { geoScore: number; archetype: PageArchetype; signals: string[] } {
  const candidate: DiscoveryCandidate = {
    url: input.url,
    sources: new Set([input.source]),
    navWeight: SOURCE_NAV_WEIGHT[input.source],
    anchorTexts: [],
    lastmod: null,
    title: input.title ?? null,
  };
  const heuristic = scoreHeuristic({ candidate, siteRoot: input.siteRoot });
  return {
    geoScore: heuristic.score,
    archetype: heuristic.archetype,
    signals: heuristic.signals,
  };
}
