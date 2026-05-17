import { describe, expect, it } from 'vitest';
import { rewriteAnswerFirstLocal } from './answer-first-local';

describe('rewriteAnswerFirstLocal', () => {
  it('preserves declarative leads with real page facts (split systems)', () => {
    const content =
      "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home";
    const { rewritten } = rewriteAnswerFirstLocal({
      title: 'Split systems',
      firstChunk: content,
    });
    expect(rewritten.toLowerCase()).toContain('split systems');
    expect(rewritten).toMatch(/Australian homes|Australia/i);
    expect(rewritten).toMatch(/heating and cooling/i);
    expect(rewritten).not.toBe(content);
    expect(rewritten).not.toMatch(/semantic clarity/i);
  });

  it('rewrites designed/built openers using section heading', () => {
    const { rewritten } = rewriteAnswerFirstLocal({
      title: 'Reliable and quality',
      firstChunk:
        'Designed and built for the most extreme conditions globally, with the operating range from -20°C to 55°C.',
    });
    expect(rewritten).toMatch(/reliable performance/i);
    expect(rewritten).toMatch(/-20/i);
    expect(rewritten).not.toMatch(/^Designed and built/i);
  });
});
