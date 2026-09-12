import { describe, expect, it } from 'vitest';
import { parseXhsSearchOutput } from './parse-xhs';

describe('parseXhsSearchOutput', () => {
  it('parses JSON array of notes', () => {
    const stdout = JSON.stringify([
      {
        title: 'Acme review 测评',
        url: 'https://www.xiaohongshu.com/explore/abc123',
        liked_count: 10,
      },
    ]);
    const hits = parseXhsSearchOutput(stdout);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toContain('Acme');
    expect(hits[0]?.url).toContain('xiaohongshu.com/explore/abc123');
  });

  it('parses line-oriented URLs', () => {
    const stdout = `Acme brand note
https://www.xiaohongshu.com/explore/note456`;
    const hits = parseXhsSearchOutput(stdout);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.url).toContain('note456');
  });
});
