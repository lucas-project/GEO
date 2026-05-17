import { describe, expect, it } from 'vitest';
import { guidanceForAnswerFirstChunk } from './issue-guidance';

describe('issue-guidance', () => {
  it('explains Designed/built opener with section heading and sample rewrite', () => {
    const g = guidanceForAnswerFirstChunk({
      id: 'chunk-001',
      heading: 'Reliable and quality',
      text:
        'Designed and built for the most extreme conditions globally, with the operating range from -20°C to 55°C. Additional supporting detail follows here.',
      wordCount: 24,
      hasAnswerFirstSentence: false,
      hasList: false,
      hasNumbers: true,
    });

    expect(g.problem).toMatch(/Reliable and quality/i);
    expect(g.problem).toMatch(/Designed and built/i);
    expect(g.problem).not.toMatch(/^This section does not open/i);
    expect(g.fixHint).toMatch(/sentence 1/i);
    expect(g.suggestedExample).toBeTruthy();
    expect(g.suggestedExample).toMatch(/-20/i);
  });

  it('keeps declarative first sentences instead of generic templates', () => {
    const g = guidanceForAnswerFirstChunk({
      id: 'chunk-002',
      heading: 'Split systems',
      text:
        "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home.",
      wordCount: 20,
      hasAnswerFirstSentence: false,
      hasList: false,
      hasNumbers: false,
    });
    expect(g.suggestedExample).toMatch(/For heating and cooling/i);
    expect(g.suggestedExample).toContain('split systems');
    expect(g.suggestedExample).not.toBe(
      "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home.",
    );
  });
});
