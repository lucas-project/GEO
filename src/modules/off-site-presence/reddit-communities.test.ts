import { describe, expect, it } from 'vitest';
import {
  filterRelevantSubreddits,
  isNoiseSubreddit,
  sanitizeParsedCommunities,
  uniqueSubredditsFromPosts,
} from './reddit-communities';
import type { RedditPost } from './schemas';

describe('isNoiseSubreddit', () => {
  it('flags Reddit global nav subreddits', () => {
    expect(isNoiseSubreddit('popular')).toBe(true);
    expect(isNoiseSubreddit('all')).toBe(true);
    expect(isNoiseSubreddit('AskReddit')).toBe(true);
    expect(isNoiseSubreddit('u_someuser')).toBe(true);
  });

  it('allows HVAC communities', () => {
    expect(isNoiseSubreddit('HVAC')).toBe(false);
    expect(isNoiseSubreddit('hvacadvice')).toBe(false);
  });
});

describe('sanitizeParsedCommunities', () => {
  it('removes noise from parsed HTML community list', () => {
    const out = sanitizeParsedCommunities(['popular', 'HVAC', 'funny', 'all']);
    expect(out).toEqual(['HVAC']);
  });
});

describe('uniqueSubredditsFromPosts', () => {
  it('returns subreddits only from curated posts', () => {
    const posts: RedditPost[] = [
      {
        title: 'Midea split system',
        subreddit: 'HVAC',
        upvotes: 10,
        comments: 5,
        awards: 0,
        url: 'https://reddit.com/r/HVAC/comments/x',
      },
    ];
    expect(uniqueSubredditsFromPosts(posts)).toEqual(['HVAC']);
  });
});

describe('filterRelevantSubreddits', () => {
  it('drops generic subs and keeps industry-relevant communities', () => {
    const out = filterRelevantSubreddits(
      ['popular', 'HVAC', 'battlerapde'],
      'MD Home',
      ['Split Systems', 'Air Conditioning'],
      'local_service',
    );
    expect(out).toContain('HVAC');
    expect(out).not.toContain('popular');
    expect(out).not.toContain('battlerapde');
  });
});
