import { describe, expect, it } from 'vitest';
import { buildReadabilityRewrite } from './readability-rewrite';
import { buildAnswerFirstRewrite } from './answer-first-rewrite';

const SPLIT_ORIGINAL =
  "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home";

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

describe('buildReadabilityRewrite', () => {
  it('shortens Australia top-choice sentences vs the original', () => {
    const out = buildReadabilityRewrite({ text: SPLIT_ORIGINAL });
    expect(words(out)).toBeLessThan(words(SPLIT_ORIGINAL));
    expect(out.toLowerCase()).toContain('split systems');
    expect(out).not.toMatch(/^For heating and cooling individual rooms or specific areas/i);
  });

  it('is shorter than the answer-first rewrite for the same source', () => {
    const shorter = buildReadabilityRewrite({ text: SPLIT_ORIGINAL });
    const answerFirst = buildAnswerFirstRewrite({ text: SPLIT_ORIGINAL, variantIndex: 0 });
    expect(words(shorter)).toBeLessThan(words(answerFirst));
  });

  it('returns different variants on repeat (straight apostrophe)', () => {
    const v0 = buildReadabilityRewrite({ text: SPLIT_ORIGINAL, variantIndex: 0 });
    const v1 = buildReadabilityRewrite({ text: SPLIT_ORIGINAL, variantIndex: 1 });
    const v2 = buildReadabilityRewrite({ text: SPLIT_ORIGINAL, variantIndex: 2 });
    expect(v0).not.toBe(v1);
    expect(v1).not.toBe(v2);
  });

  it('returns different variants with curly apostrophe in source', () => {
    const curly =
      'Split systems are Australia\u2019s top choice for heating and cooling individual rooms or specific areas in your home';
    const v0 = buildReadabilityRewrite({ text: curly, variantIndex: 0 });
    const v1 = buildReadabilityRewrite({ text: curly, variantIndex: 1 });
    expect(v0).not.toBe(v1);
  });
});
