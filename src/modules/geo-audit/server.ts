/**
 * Server-only GEO audit exports (DB, queue, Playwright pipeline).
 * Import from `@modules/geo-audit/server` in API routes and workers — not in client components.
 */

import 'server-only';

export {
  geoAuditService,
  runAudit,
  extendAudit,
  getAudit,
  getAuditPageSource,
  listRecentAudits,
  listRecentAuditSiteGroups,
  findLatestCompletedAuditForUrl,
} from './service';
export { registerGeoAuditHandlers } from './handlers';
export { discoverAuditPages } from './discover-pages';
export { resetSimulationMarketLandscape } from './reset-simulation-landscape';
export { buildLayerEvidence } from './layer-evidence';
export { updateAuditJsonWithRevision } from './revisioned-update';
export { commitAuditReportWithRevision } from './revisioned-update';
export type { RevisionedAuditRow, AuditJsonPatch, AuditReportPatch } from './revisioned-update';
