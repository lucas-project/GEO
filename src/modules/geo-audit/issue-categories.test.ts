import { describe, expect, it } from 'vitest';
import {
  canonicalCategoryForReason,
  canonicalIssueId,
  normalizeReasonText,
} from './issue-categories';

describe('issue-categories', () => {
  it('strips per-page prefixes from aggregated reasons', () => {
    expect(normalizeReasonText('/blog: No FAQ blocks — LLMs cite Q/A')).toBe(
      'No FAQ blocks — LLMs cite Q/A',
    );
  });

  it('maps FAQ-related reasons to one canonical category', () => {
    const a = canonicalCategoryForReason('No FAQ blocks — LLMs cite Q/A content disproportionately');
    const b = canonicalCategoryForReason('/pricing: No FAQ blocks detected');
    expect(a?.id).toBe('missing-faq');
    expect(b?.id).toBe('missing-faq');
    expect(canonicalIssueId('No FAQ blocks', 'citationFriendliness')).toBe('missing-faq');
  });

  it('keeps distinct categories for unrelated problems', () => {
    expect(canonicalCategoryForReason('Missing H1 — top-level topic is ambiguous')?.id).toBe(
      'missing-h1',
    );
    expect(canonicalCategoryForReason('No author/byline signals')?.id).toBe('missing-author');
  });
});
