/**
 * GEO Audit module — client-safe public surface (types, scoring copy, grouping).
 * Server pipeline: `@modules/geo-audit/server`.
 */

export { groupAuditsBySite } from './group-by-site';
export type { AuditListRow, SiteAuditGroup } from './group-by-site';
export { discoverAuditPages } from './discover-pages';
export {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DimensionScoreSchema,
} from './schemas';
export type {
  Dimension,
  DimensionScore,
  GeoAuditResult,
  Issue,
  Fix,
  PageInventory,
  AuditPageEntry,
  PageIssueImpact,
  PageCodeHighlight,
  SourceRange,
} from './schemas';
export {
  plainDimensionLabel,
  plainImpact,
  plainIssueSummary,
  expandReason,
  isNegativeReason,
} from './plain-language';
