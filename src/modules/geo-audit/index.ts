/**
 * GEO Audit module — public surface.
 */

export { geoAuditService, runAudit, getAudit, listRecentAudits } from './service';
export { registerGeoAuditHandlers } from './handlers';
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
} from './schemas';
