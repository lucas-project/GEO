import { describe, expect, it } from 'vitest';
import { detectSearchGaps, gapsFullyFilled } from './search-orchestrator';
import type { PresenceSearchPlan } from './search-plan-types';

const basePlan: PresenceSearchPlan = {
  category: 'generic',
  rationale: 'test',
  probePlatforms: ['reddit', 'quora', 'site_search'],
  searchTargets: ['reddit', 'quora', 'general', 'news'],
  skipPlatforms: [],
  customQueries: [],
  additionalSources: [],
  brandKeywords: [],
  source: 'heuristic',
};

describe('detectSearchGaps', () => {
  it('flags webFootprintWeak when general hits are low', () => {
    const gaps = detectSearchGaps({
      byPlatform: { quora: [{ url: 'https://quora.com/q/1', engine: 'bing' }] },
      social: [],
      plan: basePlan,
      generalHitEstimate: 1,
      offSiteDomainCount: 2,
    });
    expect(gaps.webFootprintWeak).toBe(true);
    expect(gapsFullyFilled(gaps)).toBe(false);
  });

  it('considers footprint strong when domains and hits are adequate', () => {
    const gaps = detectSearchGaps({
      byPlatform: {
        quora: [{ url: 'https://quora.com/q/1', engine: 'bing' }],
        reddit: [{ url: 'https://reddit.com/r/x', engine: 'bing' }],
      },
      social: [{ platform: 'linkedin', url: 'https://linkedin.com/company/x' }],
      plan: basePlan,
      generalHitEstimate: 6,
      offSiteDomainCount: 6,
    });
    expect(gaps.webFootprintWeak).toBe(false);
  });
});
