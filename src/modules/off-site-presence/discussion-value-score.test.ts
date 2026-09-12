import { describe, expect, it } from 'vitest';
import { computeDiscussionValueScore, rankDiscussionsByValue } from './discussion-value-score';
import { inferMarketFromDomain } from './market-country';

const ctx = {
  brand: 'MD Home',
  domain: 'mdhome.com.au',
  aliases: ['md home'],
  siteKeywords: ['Midea Air Conditioners', 'Split Systems'],
};

describe('computeDiscussionValueScore', () => {
  it('prioritizes brand in title over raw engagement', () => {
    const onBrand = computeDiscussionValueScore(
      {
        platform: 'reddit',
        title: 'MD Home Midea install review',
        upvotes: 5,
        comments: 2,
      },
      ctx,
    );
    const viralOffBrand = computeDiscussionValueScore(
      {
        platform: 'reddit',
        title: 'Random HVAC meme thread',
        upvotes: 5000,
        comments: 800,
      },
      ctx,
    );
    expect(onBrand.valueScore).toBeGreaterThan(viralOffBrand.valueScore);
  });

  it('adds market bonus for local threads when domain is .com.au', () => {
    const market = inferMarketFromDomain('mdhome.com.au')!;
    const local = computeDiscussionValueScore(
      {
        platform: 'reddit',
        title: 'Midea split install in Sydney',
        upvotes: 10,
        comments: 5,
      },
      { ...ctx, marketCountry: market },
    );
    const foreign = computeDiscussionValueScore(
      {
        platform: 'reddit',
        title: 'Midea vs Daikin Texas heat',
        upvotes: 50,
        comments: 20,
      },
      { ...ctx, marketCountry: market },
    );
    expect(local.valueSignals.market).toBeGreaterThan(foreign.valueSignals.market);
  });
});

describe('rankDiscussionsByValue', () => {
  it('sorts by valueScore descending', () => {
    const ranked = rankDiscussionsByValue(
      [
        { platform: 'reddit', title: 'Generic discussion', upvotes: 100, comments: 50 },
        { platform: 'reddit', title: 'MD Home dealer experience', upvotes: 8, comments: 4 },
      ],
      ctx,
    );
    expect(ranked[0]?.title).toContain('MD Home');
  });
});
