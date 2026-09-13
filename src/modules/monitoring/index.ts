/**
 * Monitoring module — public surface (Phase 4).
 */

export {
  monitoringService,
  addMonitoredSite,
  getSiteMonitorStatus,
  getMonitoredSiteDetail,
  updateMonitorSchedule,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
  runMonitoringFor,
  runMonitoringSweep,
} from './service';
export type { SiteMonitorStatus, MonitoredSiteDetail } from './service';
export { registerMonitoringHandlers } from './handlers';
export type {
  Alert,
  MonitorRun,
  AlertSeverity,
  AlertKind,
  MonitorSchedulePreset,
  MonitoringDiffPayload,
} from './schemas';
export { MonitorSchedulePresetSchema } from './schemas';
export { compareAuditSampleScopes } from './sample-comparison';
export type { AuditSampleScope, SampleComparison } from './sample-comparison';
