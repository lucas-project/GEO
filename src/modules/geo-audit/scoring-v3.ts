import type { CriterionResult } from './evidence-schema';
import { READINESS_RULE_VERSION } from './criteria';

export interface ReadinessScore {
  ruleVersion: string;
  score: number | null;
  coverage: number;
  coverageStatus: 'ready' | 'preliminary' | 'insufficient_evidence';
  observedWeight?: number;
  applicableWeight?: number;
  pendingApplicabilityWeight: number;
  range: { min: number; max: number } | null;
  criteria: CriterionResult[];
}

const value = (outcome: CriterionResult['outcome']) =>
  outcome === 'pass' ? 1 : outcome === 'partial' ? 0.5 : outcome === 'fail' ? 0 : null;

/** Score only observed, applicable rules. Unknown is a coverage gap, never zero. */
export function computeReadinessScore(criteria: CriterionResult[]): ReadinessScore {
  const applicable = criteria.filter((c) => c.applicability === 'applicable');
  const observed = applicable.filter((c) => value(c.outcome) != null);
  const applicableWeight = applicable.reduce((sum, c) => sum + c.possible, 0);
  const observedWeight = observed.reduce((sum, c) => sum + c.possible, 0);
  const earned = observed.reduce((sum, c) => sum + (c.earned ?? 0), 0);
  const coverage = applicableWeight > 0 ? observedWeight / applicableWeight : 0;
  const score = observedWeight > 0 ? Math.round((earned / observedWeight) * 100) : null;
  const pendingApplicabilityWeight = criteria
    .filter((c) => c.applicability === 'unknown')
    .reduce((sum, c) => sum + c.possible, 0);
  const range = score == null ? null : {
    min: Math.round((earned / applicableWeight) * 100),
    max: Math.round(((earned + (applicableWeight - observedWeight)) / applicableWeight) * 100),
  };
  return {
    ruleVersion: READINESS_RULE_VERSION, score, coverage,
    coverageStatus: score == null ? 'insufficient_evidence' : coverage >= 0.8 ? 'ready' : 'preliminary',
    observedWeight: observedWeight || undefined, applicableWeight: applicableWeight || undefined,
    pendingApplicabilityWeight, range, criteria,
  };
}
