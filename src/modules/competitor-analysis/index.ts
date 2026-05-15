/**
 * Competitor Analysis module — public surface (Phase 2b).
 */

export {
  competitorAnalysisService,
  runComparison,
  listRecentComparisons,
  getComparisonRun,
  getLatestCompetitorGapsForTarget,
} from './service';
export { registerCompetitorHandlers } from './handlers';
export type {
  SiteSummary,
  CompetitorComparison,
  DimensionGap,
} from './schemas';
