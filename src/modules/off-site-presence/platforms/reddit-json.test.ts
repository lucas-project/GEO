import { describe, expect, it } from 'vitest';
import { parseRedditSearchJson } from './reddit-json';

const SEARCH_FIXTURE = {
  data: {
    children: [
      {
        data: {
          title: 'Acme vs competitors — honest review',
          score: 142,
          num_comments: 24,
          subreddit: 'saas',
          permalink: '/r/saas/comments/abc123/acme_vs_competitors/',
          created_utc: 1_700_000_000,
        },
      },
      {
        data: {
          title: 'Anyone tried Acme for GEO?',
          score: 58,
          num_comments: 11,
          subreddit: 'marketing',
          permalink: '/r/marketing/comments/def456/anyone_tried_acme/',
        },
      },
    ],
  },
};

describe('parseRedditSearchJson', () => {
  it('maps listing children to RedditPost', () => {
    const posts = parseRedditSearchJson(SEARCH_FIXTURE);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.title).toContain('Acme vs competitors');
    expect(posts[0]?.upvotes).toBe(142);
    expect(posts[0]?.comments).toBe(24);
    expect(posts[0]?.subreddit).toBe('saas');
    expect(posts[0]?.url).toContain('reddit.com');
  });
});
