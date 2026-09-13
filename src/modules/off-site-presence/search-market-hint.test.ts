import { describe, expect, it } from 'vitest';
import { buildQueryDefsFromPlan } from './search-supplement';
import type { PresenceSearchPlan } from './search-plan-types';

const basePlan: PresenceSearchPlan = {
  category: 'consumer_brand',
  rationale: 'test',
  probePlatforms: ['reddit', 'quora', 'site_search'],
  searchTargets: ['reddit', 'general', 'news', 'social'],
  skipPlatforms: [],
  brandKeywords: ['acme widget'],
  customQueries: [],
  additionalSources: [],
  source: 'heuristic',
};

describe('buildQueryDefsFromPlan', () => {
  it('includes xiaohongshu and country hint for com.au domains', () => {
    const defs = buildQueryDefsFromPlan('Acme', 'shop.com.au', basePlan);
    const xhs = defs.find((d) => d.key === 'xiaohongshu');
    expect(xhs).toBeDefined();
    const q = xhs!.build('Acme', 'shop.com.au');
    expect(q).toContain('site:xiaohongshu.com');
    expect(q.toLowerCase()).toContain('australia');
  });
});
