/**
 * Monitoring module — public surface (Phase 4).
 */

export {
  monitoringService,
  addMonitoredSite,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
  runMonitoringFor,
  runMonitoringSweep,
} from './service';
export { registerMonitoringHandlers } from './handlers';
export type { Alert, MonitorRun, AlertSeverity } from './schemas';
