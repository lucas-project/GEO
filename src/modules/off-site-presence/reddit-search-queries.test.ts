import { describe, expect, it } from 'vitest';
import { buildRedditPostSearchQueries } from './reddit-search-queries';
import { inferMarketFromDomain } from './market-country';

describe('buildRedditPostSearchQueries', () => {
  it('uses quoted multi-word keywords and brand name for any site', () => {
    const { postQueries } = buildRedditPostSearchQueries({
      brand: 'Acme Analytics',
      aliases: ['acme analytics'],
      planKeywords: ['Split Systems', 'Midea Air Conditioners', 'B2B SaaS'],
    });
    expect(postQueries.some((q) => q.includes('Split Systems'))).toBe(true);
    expect(postQueries.some((q) => q.includes('Midea Air'))).toBe(true);
    expect(postQueries).toContain('Acme Analytics');
  });

  it('adds regional suffix when domain implies a market', () => {
    const market = inferMarketFromDomain('mdhome.com.au');
    const { postQueries } = buildRedditPostSearchQueries({
      brand: 'MD Home',
      aliases: [],
      planKeywords: ['Split Systems'],
      marketCountry: market,
    });
    expect(postQueries.some((q) => /Australia/i.test(q))).toBe(true);
  });
});
