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
} from './service';
export { registerGeoAuditHandlers } from './handlers';
