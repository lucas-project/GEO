/**
 * Monitoring service — Phase 4.
 *
 * Tracks monitored sites, runs scheduled re-audits, produces alerts via
 * diff against the previous audit. The "scheduler" is interval-driven
 * inside the in-process queue worker; production would use Temporal cron
 * or BullMQ repeatable jobs.
 */

import { prisma, stringifyJson, parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { runAudit } from '@modules/geo-audit';
import { diffAudits } from './diff';
import { postMonitoringAlerts } from './webhook';
import type { Alert, MonitorRun } from './schemas';

const monLogger = logger.child({ module: 'monitoring' });

export async function addMonitoredSite(
  url: string,
  opts?: { webhookUrl?: string | null },
): Promise<{ siteId: string; url: string }> {
  const canonical = normalizeWebsiteUrl(url.trim());
  const site = await prisma.site.upsert({
    where: { url: canonical },
    create: { url: canonical, monitored: true, webhookUrl: opts?.webhookUrl ?? null },
    update: {
      monitored: true,
      ...(opts?.webhookUrl !== undefined ? { webhookUrl: opts.webhookUrl } : {}),
    },
  });
  monLogger.info({ siteId: site.id, url: site.url }, 'site added to monitoring');
  return { siteId: site.id, url: site.url };
}

export async function removeMonitoredSite(siteId: string): Promise<void> {
  await prisma.site.update({ where: { id: siteId }, data: { monitored: false } });
}

export async function listMonitoredSites(): Promise<
  Array<{
    id: string;
    url: string;
    lastRunAt: string | null;
    lastScore: number | null;
    alertCount: number;
  }>
> {
  const sites = await prisma.site.findMany({ where: { monitored: true } });
  const result = [];
  for (const s of sites) {
    const lastRun = await prisma.monitoringRun.findFirst({
      where: { siteId: s.id },
      orderBy: { runAt: 'desc' },
      include: { audit: true },
    });
    const alerts = lastRun ? parseJson<Alert[]>(lastRun.alerts, []) : [];
    result.push({
      id: s.id,
      url: s.url,
      lastRunAt: lastRun?.runAt.toISOString() ?? null,
      lastScore: lastRun?.audit?.overallScore ?? null,
      alertCount: alerts.length,
    });
  }
  return result;
}

export async function listAlerts(limit = 30): Promise<
  Array<{ alert: Alert; siteUrl: string; runAt: string }>
> {
  const rows = await prisma.monitoringRun.findMany({
    orderBy: { runAt: 'desc' },
    take: 50,
    include: { site: true },
  });
  const out: Array<{ alert: Alert; siteUrl: string; runAt: string }> = [];
  for (const r of rows) {
    const alerts = parseJson<Alert[]>(r.alerts, []);
    for (const a of alerts) {
      out.push({ alert: a, siteUrl: r.site.url, runAt: r.runAt.toISOString() });
    }
  }
  return out.slice(0, limit);
}

export async function runMonitoringFor(siteId: string): Promise<MonitorRun> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('site not found');

  const previousAudit = await prisma.geoAudit.findFirst({
    where: { siteId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  monLogger.info({ siteId, url: site.url }, 'running monitoring audit');
  const auditResult = await runAudit({ url: site.url });
  const currentAudit = await prisma.geoAudit.findUnique({ where: { id: auditResult.id } });
  if (!currentAudit) throw new Error('audit row missing');

  let alerts: Alert[] = [];
  if (previousAudit) {
    alerts = diffAudits(previousAudit, currentAudit);
  }

  const run = await prisma.monitoringRun.create({
    data: {
      siteId,
      auditId: auditResult.id,
      diff: previousAudit ? stringifyJson({ from: previousAudit.id, to: auditResult.id }) : null,
      alerts: stringifyJson(alerts),
    },
  });

  await postMonitoringAlerts({
    siteUrl: site.url,
    webhookUrl: site.webhookUrl,
    runId: run.id,
    auditId: auditResult.id,
    alerts,
  });

  return {
    id: run.id,
    siteId,
    auditId: auditResult.id,
    alerts,
    runAt: run.runAt.toISOString(),
  };
}

export async function runMonitoringSweep(): Promise<{ sitesProcessed: number; totalAlerts: number }> {
  const sites = await prisma.site.findMany({ where: { monitored: true } });
  let totalAlerts = 0;
  for (const s of sites) {
    try {
      const run = await runMonitoringFor(s.id);
      totalAlerts += run.alerts.length;
    } catch (err) {
      monLogger.warn({ err: (err as Error).message, siteId: s.id }, 'monitoring failed');
    }
  }
  return { sitesProcessed: sites.length, totalAlerts };
}

export const monitoringService = {
  addMonitoredSite,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
  runMonitoringFor,
  runMonitoringSweep,
};
