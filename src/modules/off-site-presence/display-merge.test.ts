import { describe, expect, it } from 'vitest';
import { mergeCuratedWithCandidates } from './display-merge';

describe('mergeCuratedWithCandidates', () => {
  it('backfills from candidates when curation returns few items', () => {
    const merged = mergeCuratedWithCandidates(
      [{ title: 'Curated only', url: 'https://reddit.com/a' }],
      [
        { title: 'Curated only', url: 'https://reddit.com/a' },
        { title: 'SERP hit two', url: 'https://reddit.com/b' },
        { title: 'SERP hit three', url: 'https://reddit.com/c' },
      ],
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((p) => p.url)).toContain('https://reddit.com/b');
  });
});
