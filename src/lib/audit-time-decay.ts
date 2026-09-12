import { config } from '@shared/config';

/** Ref §8.4 — reduce displayed score weight as audits age. */
export function auditTimeDecayMultiplier(createdAt: Date | string, now = new Date()): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const ageDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  const thresholds = config.scoringDynamics.auditDecayDays;
  const weights = config.scoringDynamics.auditDecayWeights;
  if (ageDays <= thresholds[0]) return weights[0];
  if (ageDays <= thresholds[1]) return weights[1];
  if (ageDays <= thresholds[2]) return weights[2];
  if (ageDays <= thresholds[3]) return weights[3];
  return 0.5;
}

export function decayedScore(score: number, createdAt: Date | string): number {
  return Math.round(score * auditTimeDecayMultiplier(createdAt));
}
