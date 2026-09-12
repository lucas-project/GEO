import { describe, expect, it } from 'vitest';
import {
  REDDIT_DISPLAY_TARGET,
  rankRedditPostsForDisplay,
  redditDisplayShortfall,
} from './engagement';
import type { DiscussionValueContext } from './discussion-value-score';
import type { RedditPost } from './schemas';

const ctx: DiscussionValueContext = {
  brand: 'Acme',
  domain: 'acme.com',
  aliases: [],
  siteKeywords: ['acme widget'],
};

function mockPost(i: number, upvotes: number, comments: number): RedditPost {
  return {
    title: `Acme widget review number ${i} from customers`,
    subreddit: 'widgets',
    upvotes,
    comments,
    awards: 0,
    url: `https://reddit.com/r/widgets/comments/${i}`,
  };
}

describe('rankRedditPostsForDisplay', () => {
  it('returns up to REDDIT_DISPLAY_TARGET posts with relaxed backfill', () => {
    const posts = Array.from({ length: 14 }, (_, i) => mockPost(i, 2, 2));
    const ranked = rankRedditPostsForDisplay(posts, ctx);
    expect(ranked.length).toBeGreaterThan(3);
    expect(ranked.length).toBeLessThanOrEqual(REDDIT_DISPLAY_TARGET);
  });

  it('reports shortfall when fewer than target', () => {
    const posts = [mockPost(1, 1, 1)];
    const ranked = rankRedditPostsForDisplay(posts, ctx);
    expect(redditDisplayShortfall(ranked.length)).toBe(REDDIT_DISPLAY_TARGET - ranked.length);
  });
});
