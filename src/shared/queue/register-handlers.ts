/**
 * Single entry point for registering all queue job handlers.
 * Add one line here when introducing a new async module.
 *
 * Handler modules are loaded dynamically so Next.js dev does not bundle
 * Playwright / stealth (clone-deep) when instrumentation starts.
 */

export async function registerAllQueueHandlers(): Promise<void> {
  const [
    { registerGeoAuditHandlers },
    { registerSimulationHandlers },
    { registerCompetitorHandlers },
    { registerMonitoringHandlers },
    { registerAgentHandlers },
    { registerCrawlHandlers },
    { registerIntelligenceHandlers },
    { registerOffSitePresenceHandlers },
    { registerGeoContentHandlers },
  ] = await Promise.all([
    import('@modules/geo-audit/handlers'),
    import('@modules/ai-simulation/handlers'),
    import('@modules/competitor-analysis/handlers'),
    import('@modules/monitoring/handlers'),
    import('@modules/geo-agent/handlers'),
    import('@modules/crawling/handlers'),
    import('@modules/intelligence/handlers'),
    import('@modules/off-site-presence/handlers'),
    import('@modules/geo-content/handlers'),
  ]);

  registerGeoAuditHandlers();
  registerSimulationHandlers();
  registerCompetitorHandlers();
  registerMonitoringHandlers();
  registerIntelligenceHandlers();
  registerAgentHandlers();
  registerCrawlHandlers();
  registerOffSitePresenceHandlers();
  registerGeoContentHandlers();
}
