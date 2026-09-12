import { describe, expect, it } from 'vitest';
import { rankRedditPosts, rankRedditPostsForDisplay } from './engagement';
import { inferMarketFromDomain } from './market-country';
import type { RedditPost } from './schemas';

const posts: RedditPost[] = [
  { title: 'Low engagement', upvotes: 2, comments: 1, awards: 0 },
  { title: 'Medium thread', upvotes: 8, comments: 4, awards: 0 },
  { title: 'High engagement Ferrari discussion', upvotes: 50, comments: 20, awards: 0 },
];

describe('engagement ranking', () => {
  it('display rank returns more posts than strict rank', () => {
    const strict = rankRedditPosts(posts);
    const display = rankRedditPostsForDisplay(posts, {
      brand: 'Acme',
      domain: 'acme.com',
    });
    expect(display.length).toBeGreaterThanOrEqual(strict.length);
    expect(display.some((p) => p.title === 'Medium thread')).toBe(true);
  });

  it('ranks brand-relevant threads above high-engagement off-brand threads', () => {
    const market = inferMarketFromDomain('shop.com.au')!;
    const display = rankRedditPostsForDisplay(
      [
        { title: 'Midea in Texas heat', upvotes: 40, comments: 15, awards: 0 },
        { title: 'MD Home Midea split install Sydney', upvotes: 12, comments: 6, awards: 0 },
      ],
      {
        brand: 'MD Home',
        domain: 'shop.com.au',
        aliases: ['md home'],
        siteKeywords: ['Midea Air Conditioners'],
        marketCountry: market,
      },
    );
    expect(display[0]?.title).toContain('MD Home');
  });
});
