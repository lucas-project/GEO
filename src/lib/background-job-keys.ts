/** localStorage keys for persisted async jobs (survive navigation). */
export const BACKGROUND_JOB_KEYS = {
  audit: 'geo:audit-job',
  content: 'geo:content-job',
  presence: 'geo:presence-probe-job',
  simBatch: 'geo:sim-batch-job',
  simSingle: 'geo:sim-single-job',
  simQuestions: (auditId: string) => `geo:sim-questions-job:${auditId}`,
  competitor: 'geo:cmp-job',
  monitorRun: 'geo:monitor-run-job',
  auditExtend: (auditId: string) => `geo:audit-extend:${auditId}`,
  auditPresence: (auditId: string) => `geo:presence-audit:${auditId}`,
} as const;

export const BACKGROUND_JOB_META_KEYS = {
  simBatch: 'geo:sim-batch-meta',
  simQuestions: (auditId: string) => `geo:sim-questions-meta:${auditId}`,
  monitorRun: 'geo:monitor-run-meta',
  auditExtend: (auditId: string) => `geo:audit-extend-meta:${auditId}`,
  auditPresence: (auditId: string) => `geo:presence-audit-meta:${auditId}`,
} as const;
