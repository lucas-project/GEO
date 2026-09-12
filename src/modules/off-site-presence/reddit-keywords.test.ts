import { describe, expect, it } from 'vitest';
import { mergeRedditCurationKeywords } from './reddit-keywords';

describe('mergeRedditCurationKeywords', () => {
  it('merges workspace and plan keywords without duplicates', () => {
    const merged = mergeRedditCurationKeywords(
      ['Split Systems', 'Air Conditioning'],
      ['air conditioning', 'HVAC Dealer'],
    );
    expect(merged).toEqual(['Split Systems', 'Air Conditioning', 'HVAC Dealer']);
  });
});
