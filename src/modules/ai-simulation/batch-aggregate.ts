import type { BrandMention, SimulationResult } from './schemas';
import { refineBrandLeaderboard } from './brand-leaderboard-refine';

const JUNK_DOMAINS = new Set([
  'github.com',
  'wikipedia.org',
  'nytimes.com',
  'medium.com',
  'stackoverflow.com',
]);

export interface BatchMarketLandscape {
  brandLeaderboard: BrandMention[];
  domainLeaderboard: Array<{ domain: string; count: number }>;
}

/** Aggregate brand/domain leaderboards from discovery (non-brand) batch questions only. */
export async function aggregateDiscoveryLandscape(
  discoverySimulations: SimulationResult[],
): Promise<BatchMarketLandscape> {
  const runs = discoverySimulations.flatMap((sim) => sim.runs);
  const brandLeaderboard = runs.length > 0 ? await refineBrandLeaderboard(runs) : [];

  const domainCounts = new Map<string, number>();
  for (const sim of discoverySimulations) {
    for (const entry of sim.aggregate.domainLeaderboard) {
      if (JUNK_DOMAINS.has(entry.domain)) continue;
      domainCounts.set(entry.domain, (domainCounts.get(entry.domain) ?? 0) + entry.count);
    }
  }

  const domainLeaderboard = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return { brandLeaderboard, domainLeaderboard };
}

export function inferPromptType(text: string, targetBrand?: string): 'brand' | 'discovery' {
  const brand = targetBrand?.trim();
  if (!brand) return 'discovery';
  return text.toLowerCase().includes(brand.toLowerCase()) ? 'brand' : 'discovery';
}
