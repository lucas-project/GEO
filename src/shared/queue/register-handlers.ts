/**
 * Single entry point for registering all queue job handlers.
 * Add one line here when introducing a new async module.
 */

import { registerGeoAuditHandlers } from '@modules/geo-audit/server';
import { registerSimulationHandlers } from '@modules/ai-simulation';
import { registerCompetitorHandlers } from '@modules/competitor-analysis';
import { registerMonitoringHandlers } from '@modules/monitoring';
import { registerAgentHandlers } from '@modules/geo-agent';
import { registerCrawlHandlers } from '@modules/crawling';
import { registerIntelligenceHandlers } from '@modules/intelligence';

export function registerAllQueueHandlers(): void {
  registerGeoAuditHandlers();
  registerSimulationHandlers();
  registerCompetitorHandlers();
  registerMonitoringHandlers();
  registerIntelligenceHandlers();
  registerAgentHandlers();
  registerCrawlHandlers();
}
