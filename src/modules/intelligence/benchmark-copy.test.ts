import { describe, expect, it } from 'vitest';
import { buildBenchmarkCopy, plainPatternTitle } from './benchmark-copy';

describe('benchmark-copy', () => {
  it('uses plain title for multi-chunk', () => {
    expect(plainPatternTitle('structure', 'multi-chunk')).toBe(
      'Content split into clear sections',
    );
  });

  it('explains lift in plain language when user has pattern', () => {
    const copy = buildBenchmarkCopy({
      insightKind: 'score_lift',
      patternType: 'structure',
      patternKey: 'multi-chunk',
      cohortKey: 'global',
      sampleCount: 25,
      youHavePattern: true,
      liftPoints: 16,
      liftPercent: 41,
    });
    expect(copy.title).toContain('sections');
    expect(copy.summary).toBe('Already on your site.');
    expect(copy.summary).not.toContain('16');
    expect(copy.explanation).toContain('25');
    expect(copy.explanation).toContain('25');
    expect(copy.explanation).not.toContain('multi-chunk');
  });

  it('frames missing pattern as opportunity', () => {
    const copy = buildBenchmarkCopy({
      insightKind: 'missing_pattern',
      patternType: 'structure',
      patternKey: 'multi-chunk',
      cohortKey: 'global',
      sampleCount: 25,
      youHavePattern: false,
      liftPoints: 16,
      liftPercent: 41,
    });
    expect(copy.summary).toBe('Not detected on your site — worth adding.');
  });
});
