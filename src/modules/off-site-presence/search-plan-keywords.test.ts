import { describe, expect, it } from 'vitest';
import { mergeSiteKeywordsIntoPlan } from './search-plan';
import type { PresenceSearchPlan } from './search-plan-types';

const basePlan: PresenceSearchPlan = {
  category: 'b2b_saas',
  rationale: 'test',
  probePlatforms: ['reddit', 'quora', 'site_search'],
  searchTargets: ['reddit', 'general', 'news'],
  skipPlatforms: [],
  customQueries: [],
  additionalSources: [],
  brandKeywords: [],
  source: 'heuristic',
};

describe('mergeSiteKeywordsIntoPlan', () => {
  it('merges site keywords and adds vertical sources for open source', () => {
    const merged = mergeSiteKeywordsIntoPlan(
      basePlan,
      ['open source', 'developer api'],
      'We ship open source libraries',
      'Acme',
    );
    expect(merged.brandKeywords).toContain('open source');
    expect(merged.additionalSources.some((s) => s.host === 'github.com')).toBe(true);
  });
});
