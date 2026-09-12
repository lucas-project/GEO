/**
 * Job priority for the in-memory queue (lower number = picked sooner).
 * User-facing audits and reports should not wait behind housekeeping jobs.
 */

const DEFAULT_PRIORITY = 20;

/** @internal exported for tests */
export const JOB_PRIORITY: Record<string, number> = {
  'geo-audit.run': 0,
  'geo-audit.extend': 0,
  'geo-audit.enrich-suggestions': 5,
  'competitor.compare': 10,
  'off-site-presence.probe': 10,
  'ai-simulation.batch': 12,
  'ai-simulation.run': 12,
  'geo-content.generate': 12,
  'crawl.run': 12,
  'monitoring.run': 15,
  'agent.run': 15,
  'intelligence.ingest': 80,
  'intelligence.backfill': 80,
  'intelligence.reindex': 85,
  'intelligence.reindex-cohorts': 85,
  'monitoring.sweep': 90,
};

/** Playwright / long crawl jobs — only one at a time. */
export const HEAVY_JOB_TYPES = new Set([
  'geo-audit.run',
  'geo-audit.extend',
  'competitor.compare',
  'off-site-presence.probe',
  'crawl.run',
  'ai-simulation.batch',
  'ai-simulation.run',
  'geo-content.generate',
  'monitoring.run',
  'agent.run',
]);

/** Safe to run alongside a heavy job (embeddings, rollups). */
export const BACKGROUND_JOB_TYPES = new Set([
  'intelligence.ingest',
  'intelligence.backfill',
  'intelligence.reindex',
  'intelligence.reindex-cohorts',
  'monitoring.sweep',
]);

export function jobPriority(jobType: string): number {
  return JOB_PRIORITY[jobType] ?? DEFAULT_PRIORITY;
}

export function compareJobsByPriority<
  T extends { type: string; createdAt: Date | string },
>(a: T, b: T): number {
  const pa = jobPriority(a.type);
  const pb = jobPriority(b.type);
  if (pa !== pb) return pa - pb;
  const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
  const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
  return ta - tb;
}

export function canRunAlongsideRunning(
  runningTypes: ReadonlySet<string>,
  candidateType: string,
): boolean {
  if (runningTypes.size === 0) return true;
  if (BACKGROUND_JOB_TYPES.has(candidateType)) return true;
  for (const running of runningTypes) {
    if (!BACKGROUND_JOB_TYPES.has(running)) return false;
  }
  return true;
}

export function isHeavyJobType(jobType: string): boolean {
  return HEAVY_JOB_TYPES.has(jobType);
}
