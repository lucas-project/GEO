import { describe, expect, it } from 'vitest';
import { buildQueryDefsFromPlan, selectQueryDefs } from './search-supplement';
import type { PresenceSearchPlan } from './search-plan-types';

const plan: PresenceSearchPlan = {
  category: 'b2b_saas',
  rationale: 'test',
  probePlatforms: ['reddit', 'quora', 'site_search'],
  searchTargets: ['reddit', 'quora', 'general', 'news', 'social'],
  skipPlatforms: [],
  customQueries: [],
  additionalSources: [
    { id: 'github', host: 'github.com', label: 'GitHub', reason: 'OSS' },
  ],
  brandKeywords: ['open source'],
  source: 'heuristic',
};

describe('search-supplement query selection', () => {
  it('pins general and news when budget is tight', () => {
    const defs = buildQueryDefsFromPlan('Acme', 'acme.com', plan);
    const selected = selectQueryDefs(defs, 4);
    const keys = selected.map((d) => d.key);
    expect(keys).toContain('reddit');
    expect(keys).toContain('general');
    expect(keys).toContain('news');
  });

  it('includes vertical source queries in defs', () => {
    const defs = buildQueryDefsFromPlan('Acme', 'acme.com', plan);
    expect(defs.some((d) => d.key === 'vertical_github')).toBe(true);
  });

  it('adds keyword-based reddit and general queries for multi-word phrases', () => {
    const localPlan: PresenceSearchPlan = {
      ...plan,
      category: 'local_service',
      brandKeywords: ['Midea dealer', 'split system', 'heat pump', 'mdhome'],
    };
    const defs = buildQueryDefsFromPlan('MD Home', 'mdhome.com.au', localPlan);
    expect(defs.some((d) => d.key.startsWith('kw_reddit_'))).toBe(true);
    expect(defs.some((d) => d.build('MD Home', 'mdhome.com.au').includes('split system'))).toBe(true);
  });
});
