import { describe, expect, it } from 'vitest';

function liftPercent(withAvg: number, withoutAvg: number): number | undefined {
  if (withoutAvg <= 0) return undefined;
  return Math.round(((withAvg - withoutAvg) / withoutAvg) * 100);
}

function comparativeStats(withScores: number[], withoutScores: number[]) {
  const withAvg = withScores.reduce((a, b) => a + b, 0) / withScores.length;
  const withoutAvg =
    withoutScores.length > 0
      ? withoutScores.reduce((a, b) => a + b, 0) / withoutScores.length
      : undefined;
  const liftPoints = withoutAvg !== undefined ? Math.round(withAvg - withoutAvg) : undefined;
  const liftPct = withoutAvg !== undefined ? liftPercent(withAvg, withoutAvg) : undefined;
  return { withAvg, withoutAvg, liftPoints, liftPct };
}

describe('cohort lift math', () => {
  it('computes lift points and percent', () => {
    const { liftPoints, liftPct } = comparativeStats([90, 88], [70, 72]);
    expect(liftPoints).toBe(18);
    expect(liftPct).toBe(25);
  });

  it('handles empty without cohort', () => {
    const { liftPoints, liftPct } = comparativeStats([85], []);
    expect(liftPoints).toBeUndefined();
    expect(liftPct).toBeUndefined();
  });
});
