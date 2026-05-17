/**
 * Monitoring service — continuous re-audits with scheduled sweeps.
 */

import { prisma, stringifyJson, parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { config } from '@shared/config';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import {
  listSitesDueForMonitor,
  scheduleNextMonitorRun,
  scheduleMonitorFailureBackoff,
  computeNextRunAt,
  isMonitorLockStale,
  presetToHours,
} from '@shared/scheduler/monitor-due';
import { runAudit } from '@modules/geo-audit/server';
import { verifyPendingFixOutcomes, ingestCitationSnapshot } from '@modules/intelligence';
import { runSimulation } from '@modules/ai-simulation';
import {
  diffAudits,
  signalsFromExtractions,
  crawlHealthFromResults,
  competitorSignalsFromReports,
  serializeMonitoringDiff,
} from './diff';
import { postMonitoringAlerts } from './webhook';
import type { Alert, MonitorRun, MonitorSchedulePreset } from './schemas';

const monLogger = logger.child({ module: 'monitoring' });

const EXTRACTION_SELECT = {
  schemas: true,
  faqs: true,
  entities: true,
  headings: true,
  chunks: true,
} as const;

export interface AddMonitorOpts {
  webhookUrl?: string | null;
  monitorIntervalHours?: number;
  monitorSchedulePreset?: MonitorSchedulePreset;
  monitorEnabled?: boolean;
  /** Same-origin URLs to include in each scheduled re-audit. */
  monitorPageUrls?: string[];
  ownerId?: string;
}

export interface SiteMonitorStatus {
  siteId: string;
  url: string;
  monitored: boolean;
  monitorEnabled: boolean;
  monitorPageUrls: string[];
}

function parseMonitorPageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parsed = parseJson<string[]>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u.length > 0) : [];
}

export async function getSiteMonitorStatus(siteId: string): Promise<SiteMonitorStatus | null> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return null;
  return {
    siteId: site.id,
    url: site.url,
    monitored: site.monitored,
    monitorEnabled: site.monitorEnabled,
    monitorPageUrls: parseMonitorPageUrls(site.monitorPageUrls),
  };
}

function resolveHoursFromPreset(
  preset: MonitorSchedulePreset,
  intervalHours?: number,
): number {
  if (preset === 'adaptive') return intervalHours ?? config.monitoring.defaultIntervalHours;
  return presetToHours(preset);
}

export async function addMonitoredSite(
  url: string,
  opts?: AddMonitorOpts,
): Promise<{ siteId: string; url: string }> {
  const canonical = normalizeWebsiteUrl(url.trim());
  const preset = opts?.monitorSchedulePreset ?? 'daily';
  const interval =
    opts?.monitorIntervalHours ?? resolveHoursFromPreset(preset, opts?.monitorIntervalHours);
  const pageUrlsJson =
    opts?.monitorPageUrls !== undefined ? stringifyJson(opts.monitorPageUrls) : undefined;

  const site = await prisma.site.upsert({
    where: { url: canonical },
    create: {
      url: canonical,
      ownerId: opts?.ownerId ?? 'local',
      monitored: true,
      monitorEnabled: opts?.monitorEnabled ?? true,
      monitorSchedulePreset: preset,
      monitorIntervalHours: interval,
      nextRunAt: computeNextRunAt(interval),
      webhookUrl: opts?.webhookUrl ?? null,
      ...(pageUrlsJson !== undefined ? { monitorPageUrls: pageUrlsJson } : {}),
    },
    update: {
      monitored: true,
      monitorEnabled: opts?.monitorEnabled ?? true,
      ...(opts?.monitorSchedulePreset !== undefined
        ? { monitorSchedulePreset: opts.monitorSchedulePreset }
        : {}),
      ...(opts?.monitorIntervalHours !== undefined || opts?.monitorSchedulePreset !== undefined
        ? {
            monitorIntervalHours: interval,
            nextRunAt: computeNextRunAt(interval),
          }
        : {}),
      ...(opts?.webhookUrl !== undefined ? { webhookUrl: opts.webhookUrl } : {}),
      ...(pageUrlsJson !== undefined ? { monitorPageUrls: pageUrlsJson } : {}),
    },
  });
  monLogger.info({ siteId: site.id, url: site.url, preset }, 'site added to monitoring');
  return { siteId: site.id, url: site.url };
}

export async function updateMonitorSchedule(
  siteId: string,
  input: {
    monitorEnabled?: boolean;
    monitorIntervalHours?: number;
    monitorSchedulePreset?: MonitorSchedulePreset;
    monitorPageUrls?: string[];
  },
): Promise<void> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('site not found');

  const preset = input.monitorSchedulePreset ?? (site.monitorSchedulePreset as MonitorSchedulePreset);
  const interval = input.monitorIntervalHours ?? resolveHoursFromPreset(preset, site.monitorIntervalHours);

  await prisma.site.update({
    where: { id: siteId },
    data: {
      ...(input.monitorEnabled !== undefined ? { monitorEnabled: input.monitorEnabled } : {}),
      ...(input.monitorSchedulePreset !== undefined
        ? { monitorSchedulePreset: input.monitorSchedulePreset }
        : {}),
      ...(input.monitorIntervalHours !== undefined || input.monitorSchedulePreset !== undefined
        ? {
            monitorIntervalHours: interval,
            nextRunAt: input.monitorEnabled !== false ? computeNextRunAt(interval) : site.nextRunAt,
          }
        : {}),
      ...(input.monitorPageUrls !== undefined
        ? { monitorPageUrls: stringifyJson(input.monitorPageUrls) }
        : {}),
    },
  });
}

export async function removeMonitoredSite(siteId: string): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: { monitored: false, monitorEnabled: false },
  });
}

export async function listMonitoredSites(ownerId?: string): Promise<
  Array<{
    id: string;
    url: string;
    lastRunAt: string | null;
    lastScore: number | null;
    lastAuditId: string | null;
    alertCount: number;
    monitorEnabled: boolean;
    monitorIntervalHours: number;
    monitorSchedulePreset: string;
    monitorHealthCheck: boolean;
    monitorPageUrls: string[];
    nextRunAt: string | null;
    lastMonitorStatus: string | null;
    lastMonitorError: string | null;
    trend: number[];
    dimensionTrend: Record<string, number[]>;
  }>
> {
  const sites = await prisma.site.findMany({
    where: { monitored: true, ...(ownerId ? { ownerId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const result = [];
  for (const s of sites) {
    const lastRun = await prisma.monitoringRun.findFirst({
      where: { siteId: s.id },
      orderBy: { runAt: 'desc' },
      include: { audit: true },
    });
    const alerts = lastRun ? parseJson<Alert[]>(lastRun.alerts, []) : [];

    const rollups = await prisma.auditRollup.findMany({
      where: { siteId: s.id },
      orderBy: { createdAt: 'asc' },
      take: 30,
      select: { overallScore: true, dimensionScores: true },
    });

    const dimensionTrend: Record<string, number[]> = {};
    for (const r of rollups) {
      const dims = parseJson<Record<string, { score: number }>>(r.dimensionScores, {});
      for (const [k, v] of Object.entries(dims)) {
        if (!dimensionTrend[k]) dimensionTrend[k] = [];
        dimensionTrend[k].push(v.score ?? 0);
      }
    }

    result.push({
      id: s.id,
      url: s.url,
      lastRunAt: lastRun?.runAt.toISOString() ?? null,
      lastScore: lastRun?.audit?.overallScore ?? null,
      lastAuditId: lastRun?.auditId ?? null,
      alertCount: alerts.length,
      monitorEnabled: s.monitorEnabled,
      monitorIntervalHours: s.monitorIntervalHours,
      monitorSchedulePreset: s.monitorSchedulePreset ?? 'daily',
      monitorHealthCheck: s.monitorHealthCheck,
      monitorPageUrls: parseMonitorPageUrls(s.monitorPageUrls),
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      lastMonitorStatus: s.lastMonitorStatus,
      lastMonitorError: s.lastMonitorError,
      trend: rollups.map((r) => r.overallScore),
      dimensionTrend,
    });
  }
  return result;
}

export async function listAlerts(limit = 30, ownerId?: string): Promise<
  Array<{
    alert: Alert;
    siteUrl: string;
    siteId: string;
    runId: string;
    auditId: string | null;
    runAt: string;
  }>
> {
  const rows = await prisma.monitoringRun.findMany({
    where: ownerId ? { site: { ownerId } } : undefined,
    orderBy: { runAt: 'desc' },
    take: 50,
    include: { site: true },
  });
  const out: Array<{
    alert: Alert;
    siteUrl: string;
    siteId: string;
    runId: string;
    auditId: string | null;
    runAt: string;
  }> = [];
  for (const r of rows) {
    const alerts = parseJson<Alert[]>(r.alerts, []);
    for (const a of alerts) {
      out.push({
        alert: a,
        siteUrl: r.site.url,
        siteId: r.siteId,
        runId: r.id,
        auditId: r.auditId,
        runAt: r.runAt.toISOString(),
      });
    }
  }
  return out.slice(0, limit);
}

async function loadCitationVisibility(siteId: string): Promise<number | null> {
  const snap = await prisma.citationSnapshot.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    select: { targetVisibilityScore: true },
  });
  return snap?.targetVisibilityScore ?? null;
}

async function loadCompetitorSignals(siteId: string) {
  const rows = await prisma.competitorReport.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { competitorUrl: true, diff: true, createdAt: true },
  });
  const latestByUrl = new Map<string, { competitorUrl: string; diff: string }>();
  for (const r of rows) {
    if (!latestByUrl.has(r.competitorUrl)) {
      latestByUrl.set(r.competitorUrl, r);
    }
  }
  return competitorSignalsFromReports([...latestByUrl.values()]);
}

export interface MonitoredSiteDetail {
  id: string;
  url: string;
  monitorEnabled: boolean;
  monitorIntervalHours: number;
  monitorSchedulePreset: string;
  monitorHealthCheck: boolean;
  monitorPageUrls: string[];
  nextRunAt: string | null;
  lastMonitorStatus: string | null;
  lastMonitorError: string | null;
  runs: Array<{
    id: string;
    runAt: string;
    auditId: string | null;
    overallScore: number | null;
    alerts: Alert[];
    overallDelta: number | null;
  }>;
}

export async function getMonitoredSiteDetail(siteId: string): Promise<MonitoredSiteDetail | null> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return null;

  const runs = await prisma.monitoringRun.findMany({
    where: { siteId },
    orderBy: { runAt: 'desc' },
    take: 25,
    include: {
      audit: { select: { id: true, overallScore: true } },
    },
  });

  return {
    id: site.id,
    url: site.url,
    monitorEnabled: site.monitorEnabled,
    monitorIntervalHours: site.monitorIntervalHours,
    monitorSchedulePreset: site.monitorSchedulePreset ?? 'daily',
    monitorHealthCheck: site.monitorHealthCheck,
    monitorPageUrls: parseMonitorPageUrls(site.monitorPageUrls),
    nextRunAt: site.nextRunAt?.toISOString() ?? null,
    lastMonitorStatus: site.lastMonitorStatus,
    lastMonitorError: site.lastMonitorError,
    runs: runs.map((r) => {
      const diff = r.diff
        ? parseJson<{ scores?: { overallDelta?: number } }>(r.diff, {})
        : null;
      return {
        id: r.id,
        runAt: r.runAt.toISOString(),
        auditId: r.auditId,
        overallScore: r.audit?.overallScore ?? null,
        alerts: parseJson<Alert[]>(r.alerts, []),
        overallDelta: diff?.scores?.overallDelta ?? null,
      };
    }),
  };
}

export async function runMonitoringFor(
  siteId: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<MonitorRun> {
  const started = Date.now();
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error('site not found');

  if (!isMonitorLockStale(site.monitorLockedAt, site.lastMonitorStatus)) {
    throw new Error('monitor already running for this site');
  }

  onProgress?.(5, 'Starting monitor run…');

  await prisma.site.update({
    where: { id: siteId },
    data: {
      lastMonitorStatus: 'running',
      lastMonitorError: null,
      monitorLockedAt: new Date(),
    },
  });

  try {
    const previousAudit = await prisma.geoAudit.findFirst({
      where: { siteId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });

    let prevExtraction;
    let prevCrawl;
    if (previousAudit) {
      const prevRows = await prisma.extractionResult.findMany({
        where: { auditId: previousAudit.id },
        select: EXTRACTION_SELECT,
      });
      prevExtraction = signalsFromExtractions(prevRows);
      const prevCrawlRows = await prisma.crawlResult.findMany({
        where: { auditId: previousAudit.id },
        select: { error: true, renderedHtml: true },
      });
      prevCrawl = crawlHealthFromResults(prevCrawlRows);
    }

    const prevCitationVisibility = await loadCitationVisibility(siteId);
    const prevCompetitors = await loadCompetitorSignals(siteId);

    const maxPages = site.monitorHealthCheck
      ? config.monitoring.healthCheckMaxPages
      : undefined;

    onProgress?.(12, 'Loading previous baseline…');

    monLogger.info(
      { siteId, url: site.url, healthCheck: site.monitorHealthCheck, maxPages },
      'running monitoring audit',
    );

    const monitorPageUrls = parseMonitorPageUrls(site.monitorPageUrls);
    onProgress?.(18, 'Running GEO audit…');
    const auditResult = await runAudit({
      url: site.url,
      maxPages: monitorPageUrls.length > 0 ? monitorPageUrls.length : maxPages,
      pageUrls: monitorPageUrls.length > 0 ? monitorPageUrls : undefined,
      onProgress: (p, m) => onProgress?.(18 + Math.round(p * 0.62), m),
    });
    const currentAudit = await prisma.geoAudit.findUnique({ where: { id: auditResult.id } });
    if (!currentAudit) throw new Error('audit row missing');

    const curRows = await prisma.extractionResult.findMany({
      where: { auditId: auditResult.id },
      select: EXTRACTION_SELECT,
    });
    const curExtraction = signalsFromExtractions(curRows);
    const curCrawlRows = await prisma.crawlResult.findMany({
      where: { auditId: auditResult.id },
      select: { error: true, renderedHtml: true },
    });
    const curCrawl = crawlHealthFromResults(curCrawlRows);

    if (site.monitorSimulation) {
      try {
        await runSimulation({
          prompt: `What is ${site.url} known for?`,
          targetBrand: new URL(site.url).hostname.replace(/^www\./, ''),
          siteId: site.id,
        });
        await ingestCitationSnapshot(siteId, auditResult.id);
      } catch (err) {
        monLogger.warn({ err: (err as Error).message, siteId }, 'monitor simulation skipped');
      }
    }

    const curCitationVisibility = await loadCitationVisibility(siteId);
    const curCompetitors = await loadCompetitorSignals(siteId);

    onProgress?.(84, 'Comparing with previous audit…');

    let alerts: Alert[] = [];
    let diffJson: string | null = null;
    if (previousAudit) {
      const scoringMetaByAudit = await loadScoringMetaForAudits([
        previousAudit.id,
        currentAudit.id,
      ]);
      const prevWithMeta = {
        ...previousAudit,
        scoringMeta: scoringMetaByAudit.get(previousAudit.id),
      };
      const curWithMeta = {
        ...currentAudit,
        scoringMeta: scoringMetaByAudit.get(currentAudit.id),
      };
      const { alerts: diffAlerts, diff } = diffAudits(prevWithMeta, curWithMeta, {
        prevExtraction,
        curExtraction,
        prevCitation: { targetVisibilityScore: prevCitationVisibility },
        curCitation: { targetVisibilityScore: curCitationVisibility },
        prevCrawl,
        curCrawl,
        prevCompetitors,
        curCompetitors,
      });
      alerts = diffAlerts;
      diffJson = serializeMonitoringDiff(diff);
    }

    await verifyPendingFixOutcomes(
      siteId,
      currentAudit.overallScore,
      currentAudit.dimensions,
    ).catch(() => {});

    onProgress?.(92, 'Saving monitor run…');

    const run = await prisma.monitoringRun.create({
      data: {
        siteId,
        auditId: auditResult.id,
        diff: diffJson,
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

    await scheduleNextMonitorRun(siteId);
    await prisma.site.update({
      where: { id: siteId },
      data: {
        lastMonitorStatus: 'ok',
        lastMonitorError: null,
        monitorLockedAt: null,
      },
    });

    onProgress?.(100, 'Monitor run complete');

    monLogger.info(
      { siteId, url: site.url, alertCount: alerts.length, durationMs: Date.now() - started },
      'monitoring run complete',
    );

    return {
      id: run.id,
      siteId,
      auditId: auditResult.id,
      alerts,
      runAt: run.runAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failures = site.monitorFailureCount + 1;
    await scheduleMonitorFailureBackoff(siteId, failures);
    await prisma.site.update({
      where: { id: siteId },
      data: {
        lastMonitorStatus: 'failed',
        lastMonitorError: message,
        monitorLockedAt: null,
      },
    });
    monLogger.warn(
      { siteId, failures, err: message, durationMs: Date.now() - started },
      'monitoring run failed — entering health-check backoff',
    );
    throw err;
  }
}

/** Process only sites due for their scheduled interval. */
export async function runMonitoringSweep(): Promise<{
  sitesProcessed: number;
  totalAlerts: number;
  failed: number;
}> {
  const sweepStarted = Date.now();
  const due = await listSitesDueForMonitor();
  let totalAlerts = 0;
  let failed = 0;
  for (const s of due) {
    try {
      const run = await runMonitoringFor(s.id);
      totalAlerts += run.alerts.length;
    } catch (err) {
      failed++;
      monLogger.warn({ err: (err as Error).message, siteId: s.id }, 'monitoring failed in sweep');
    }
  }
  monLogger.info(
    { sitesProcessed: due.length, totalAlerts, failed, durationMs: Date.now() - sweepStarted },
    'monitoring sweep complete',
  );
  return { sitesProcessed: due.length, totalAlerts, failed };
}

async function loadScoringMetaForAudits(
  auditIds: string[],
): Promise<Map<string, string | undefined>> {
  const out = new Map<string, string | undefined>();
  if (auditIds.length === 0) return out;
  const placeholders = auditIds.map(() => '?').join(',');
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; scoringMeta: string }>>(
    `SELECT "id", "scoringMeta" FROM "GeoAudit" WHERE "id" IN (${placeholders})`,
    ...auditIds,
  ).catch(() => []);
  for (const id of auditIds) out.set(id, undefined);
  for (const row of rows) {
    if (row.scoringMeta && row.scoringMeta !== '{}') {
      out.set(row.id, row.scoringMeta);
    }
  }
  return out;
}

export const monitoringService = {
  addMonitoredSite,
  getSiteMonitorStatus,
  getMonitoredSiteDetail,
  updateMonitorSchedule,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
  runMonitoringFor,
  runMonitoringSweep,
};
