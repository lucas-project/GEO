import { describe, expect, it } from 'vitest';
import { parseRdtSearchOutput } from './parse-rdt';

describe('parseRdtSearchOutput', () => {
  it('parses yaml-like blocks', () => {
    const stdout = `- title: Acme on Reddit
  permalink: https://www.reddit.com/r/test/comments/abc123/title/
  subreddit: test
  score: 42
  num_comments: 7`;
    const hits = parseRdtSearchOutput(stdout);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Acme on Reddit');
    expect(hits[0]?.url).toContain('reddit.com');
    expect(hits[0]?.upvotes).toBe(42);
  });

  it('parses JSON results', () => {
    const stdout = JSON.stringify([
      {
        title: 'Thread',
        permalink: '/r/foo/comments/xyz/bar/',
        subreddit: 'foo',
        score: 5,
        num_comments: 2,
      },
    ]);
    const hits = parseRdtSearchOutput(stdout);
    expect(hits[0]?.url).toBe('https://www.reddit.com/r/foo/comments/xyz/bar/');
  });
});
