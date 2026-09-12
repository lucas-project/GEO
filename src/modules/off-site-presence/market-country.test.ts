import { describe, expect, it } from 'vitest';
import {
  inferMarketFromDomain,
  partitionRedditPostsByMarket,
  scoreRedditPostMarketRelevance,
} from './market-country';

describe('inferMarketFromDomain', () => {
  it('detects Australia from .com.au', () => {
    const m = inferMarketFromDomain('mdhome.com.au');
    expect(m?.code).toBe('AU');
    expect(m?.name).toBe('Australia');
  });

  it('detects UK from .co.uk', () => {
    expect(inferMarketFromDomain('https://www.acme.co.uk')?.code).toBe('GB');
  });
});

describe('partitionRedditPostsByMarket', () => {
  const market = inferMarketFromDomain('shop.com.au')!;

  it('splits AU vs US threads', () => {
    const { primary, other } = partitionRedditPostsByMarket(
      [
        { title: 'Best split system installer in Sydney?' },
        { title: 'Midea vs Daikin — Texas heat pump advice' },
      ],
      market,
    );
    expect(primary).toHaveLength(1);
    expect(other).toHaveLength(1);
    expect(scoreRedditPostMarketRelevance(primary[0]!, market)).toBeGreaterThanOrEqual(1);
  });
});
