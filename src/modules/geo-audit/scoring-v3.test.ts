import { describe, expect, it } from 'vitest';
import type { CriterionResult } from './evidence-schema';
import { computeReadinessScore } from './scoring-v3';

const criterion = (
  outcome: CriterionResult['outcome'],
  possible = 20,
): CriterionResult => ({
  criterionId: `test.${outcome}.${possible}`,
  ruleVersion: 'test', scope: 'page', applicability: 'applicable', outcome,
  earned: outcome === 'pass' ? possible : outcome === 'partial' ? possible / 2 : outcome === 'fail' ? 0 : null,
  possible, confidence: outcome === 'unknown' ? 'unrated' : 'high',
  confidenceReason: 'test', evidenceIds: ['ev-test'],
  ...(outcome === 'unknown' ? { missingReason: 'not observed' } : {}),
});

describe('computeReadinessScore', () => {
  it('does not treat unknown evidence as a failed check', () => {
    const score = computeReadinessScore([criterion('pass'), criterion('unknown')]);
    expect(score.score).toBe(100);
    expect(score.coverage).toBe(0.5);
    expect(score.coverageStatus).toBe('preliminary');
    expect(score.range).toEqual({ min: 50, max: 100 });
  });

  it('returns insufficient evidence rather than a zero score without observations', () => {
    const score = computeReadinessScore([criterion('unknown')]);
    expect(score.score).toBeNull();
    expect(score.coverageStatus).toBe('insufficient_evidence');
  });

  it('scores only observed applicable rules deterministically', () => {
    const criteria = [criterion('pass', 20), criterion('partial', 20), criterion('fail', 20)];
    expect(computeReadinessScore(criteria)).toEqual(computeReadinessScore(criteria));
    expect(computeReadinessScore(criteria).score).toBe(50);
  });
});
