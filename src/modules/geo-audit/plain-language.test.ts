import { describe, expect, it } from 'vitest';
import {
  expandReason,
  isNegativeReason,
  plainDimensionLabel,
  plainGateExplanation,
  plainIssueSummary,
  issueIdForReason,
} from './plain-language';

describe('plain-language', () => {
  it('flags negative scoring reasons', () => {
    expect(isNegativeReason('No FAQ blocks found')).toBe(true);
    expect(isNegativeReason('FAQ blocks present')).toBe(false);
    expect(isNegativeReason('JSON-LD structured data detected')).toBe(false);
  });

  it('expands common FAQ reason', () => {
    const text = expandReason('No FAQ blocks found on site');
    expect(text).toMatch(/question-and-answer/i);
  });

  it('builds stable issue ids from dimension and reason', () => {
    expect(issueIdForReason('structuredContent', 'No JSON-LD')).toBe(
      'issue-structuredContent-no-json-ld',
    );
  });

  it('uses friendly dimension labels', () => {
    expect(plainDimensionLabel('citationFriendliness')).toMatch(/quoting/i);
  });

  it('summaryPlain includes score and dimension', () => {
    const summary = plainIssueSummary('semanticClarity', 'Missing H1', 42);
    expect(summary).toMatch(/42\/100/);
    expect(summary).toMatch(/Clear page structure/i);
  });

  it('explains crawler weak gates without raw-score jargon', () => {
    const text = plainGateExplanation({
      type: 'crawler_weak',
      description: 'AI crawler access is limited (crawler score 45)',
      cap: 60,
    });
    expect(text).toMatch(/cannot go above 60\/100/i);
    expect(text).not.toMatch(/\braw score\b/i);
    expect(text).not.toMatch(/downstream/i);
  });
});
