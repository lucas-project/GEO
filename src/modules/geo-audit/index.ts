/**
 * GEO Audit module — client-safe public surface (types, scoring copy, grouping).
 * Server pipeline: `@modules/geo-audit/server`.
 */

export { groupAuditsBySite } from './group-by-site';
export type { AuditListRow, SiteAuditGroup } from './group-by-site';
export { ARCHETYPE_LABELS, ARCHETYPE_DISPLAY_ORDER } from './archetype-labels';
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
  PageArchetype,
  DiscoverySource,
  PageIssueImpact,
  PageCodeHighlight,
  SourceRange,
} from './schemas';
export { PAGE_ARCHETYPES, DISCOVERY_SOURCES } from './schemas';
export {
  plainDimensionLabel,
  plainImpact,
  plainIssueSummary,
  expandReason,
  isNegativeReason,
} from './plain-language';
