import { describe, expect, it } from 'vitest';
import {
  facebookHitsToPosts,
  isFacebookPostUrl,
  isFacebookProfileUrl,
  parseEngagementFromSnippet,
} from './facebook-posts';

describe('facebook URL classification', () => {
  it('detects post URLs', () => {
    expect(
      isFacebookPostUrl('https://www.facebook.com/acme/posts/123456'),
    ).toBe(true);
    expect(
      isFacebookPostUrl('https://www.facebook.com/photo.php?fbid=99'),
    ).toBe(true);
  });

  it('detects profile URLs', () => {
    expect(isFacebookProfileUrl('https://www.facebook.com/acme')).toBe(true);
    expect(
      isFacebookProfileUrl('https://www.facebook.com/acme/posts/1'),
    ).toBe(false);
  });
});

describe('parseEngagementFromSnippet', () => {
  it('parses likes and comments from snippet text', () => {
    const out = parseEngagementFromSnippet('12K likes · 340 comments · 2 days ago');
    expect(out.likes).toBe(12000);
    expect(out.comments).toBe(340);
  });
});

describe('facebookHitsToPosts', () => {
  it('maps SERP hits to posts', () => {
    const posts = facebookHitsToPosts([
      {
        url: 'https://www.facebook.com/brand/posts/abc',
        title: 'MD Home summer sale on splits',
        snippet: '50 likes · 8 comments',
        engine: 'bing',
      },
      {
        url: 'https://www.facebook.com/brand',
        title: 'MD Home',
        engine: 'bing',
      },
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.likes).toBe(50);
  });
});
