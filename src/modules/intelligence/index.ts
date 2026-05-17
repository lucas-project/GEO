export {
  intelligenceService,
  ingestAudit,
  ingestAuditSync,
  ingestAuditEmbeddings,
  reindexPatterns,
  backfillIntelligenceFromAudits,
  getMinCohortSamples,
  getEffectiveMinCohortSamples,
  ingestCitationSnapshot,
  getBenchmarksForSite,
  getPlaybook,
  getSiteTrend,
  getIntelligenceContext,
  findSimilarCohortChunks,
  recordFixApplied,
  verifyPendingFixOutcomes,
  getCohortInsights,
  getIntelligenceGraphSummary,
} from './service';
export { buildIssueKey, slugifyReason } from './issue-key';
export type {
  BenchmarkInsight,
  PlaybookEntry,
  SiteTrend,
  PatternType,
  RollupSignals,
  InsightKind,
  IntelligenceGraphSummary,
} from './schemas';
export { registerIntelligenceHandlers } from './handlers';
export type { IntelligenceIngestPayload } from './handlers';
