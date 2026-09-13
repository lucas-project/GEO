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
  getCitationVisibilityTrend,
  getLatestCitationVisibility,
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
export { pickBenchmarkForArtifact } from './artifact-benchmark-match';
export { parseExtractionRow } from './rollup';
export { getLatestCitationSnapshot } from './citation-snapshot';
export { registerIntelligenceHandlers } from './handlers';
export type { IntelligenceIngestPayload } from './handlers';
