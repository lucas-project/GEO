/**
 * Monitor scheduling helpers — determine which sites are due for re-audit.
 */

import { config } from '@shared/config';
import { prisma, parseJson } from '@shared/database/client';

export type MonitorSchedulePreset = '12h' | 'daily' | 'weekly' | 'adaptive';

export const SCHEDULE_PRESET_HOURS: Record<MonitorSchedulePreset, number> = {
  '12h': 12,
  daily: 24,
  weekly: 168,
  adaptive: 24,
};

export function presetToHours(preset: string): number {
  if (preset in SCHEDULE_PRESET_HOURS) {
    return SCHEDULE_PRESET_HOURS[preset as MonitorSchedulePreset];
  }
  return config.monitoring.defaultIntervalHours;
}

export function computeNextRunAt(intervalHours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
}

export function computeFailureBackoffHours(failureCount: number): number {
  const base = config.monitoring.failureBackoffBaseHours;
  const max = config.monitoring.maxFailureBackoffHours;
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(max, base * 2 ** exponent);
}

export function isMonitorLockStale(lockedAt: Date | null, status: string | null): boolean {
  if (status !== 'running') return true;
  if (!lockedAt) return true;
  const timeoutMs = config.monitoring.runningLockTimeoutMinutes * 60 * 1000;
  return Date.now() - lockedAt.getTime() > timeoutMs;
}

/** Adaptive: shorten interval after regressions; lengthen when stable. */
export function computeAdaptiveIntervalHours(input: {
  baseHours: number;
  recentRegressionAlerts: number;
  recentRuns: number;
  monitorFailureCount: number;
}): number {
  const { baseHours, recentRegressionAlerts, recentRuns, monitorFailureCount } = input;
  let hours = baseHours;

  if (recentRegressionAlerts >= 2) {
    hours = Math.max(12, Math.floor(baseHours / 2));
  } else if (recentRegressionAlerts === 1) {
    hours = Math.max(12, Math.floor(baseHours * 0.75));
  } else if (recentRuns >= 3 && recentRegressionAlerts === 0) {
    hours = Math.min(168, Math.floor(baseHours * 1.5));
  }

  if (monitorFailureCount > 0) {
    hours = Math.max(hours, computeFailureBackoffHours(monitorFailureCount));
  }

  return Math.min(168, Math.max(12, hours));
}

export async function resolveMonitorIntervalHours(siteId: string): Promise<number> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      monitorSchedulePreset: true,
      monitorIntervalHours: true,
      monitorFailureCount: true,
    },
  });
  if (!site) return config.monitoring.defaultIntervalHours;

  const preset = (site.monitorSchedulePreset || 'daily') as MonitorSchedulePreset;
  const base = preset === 'adaptive' ? site.monitorIntervalHours || 24 : presetToHours(preset);

  if (preset !== 'adaptive') return base;

  const recentRuns = await prisma.monitoringRun.findMany({
    where: { siteId },
    orderBy: { runAt: 'desc' },
    take: 5,
    select: { alerts: true },
  });

  let recentRegressionAlerts = 0;
  for (const run of recentRuns) {
    const alerts = parseJson<Array<{ severity?: string }>>(run.alerts, []);
    recentRegressionAlerts += alerts.filter((a) => a.severity === 'regression').length;
  }

  return computeAdaptiveIntervalHours({
    baseHours: base,
    recentRegressionAlerts,
    recentRuns: recentRuns.length,
    monitorFailureCount: site.monitorFailureCount,
  });
}

/** Sites with monitoring enabled and nextRunAt in the past (or unset), excluding active locks. */
export async function listSitesDueForMonitor(): Promise<
  Array<{ id: string; url: string; monitorIntervalHours: number; monitorHealthCheck: boolean }>
> {
  const now = new Date();
  const sites = await prisma.site.findMany({
    where: {
      monitored: true,
      monitorEnabled: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    select: {
      id: true,
      url: true,
      monitorIntervalHours: true,
      monitorHealthCheck: true,
      lastMonitorStatus: true,
      monitorLockedAt: true,
    },
    orderBy: { nextRunAt: 'asc' },
  });

  return sites
    .filter((s) => isMonitorLockStale(s.monitorLockedAt, s.lastMonitorStatus))
    .map(({ id, url, monitorIntervalHours, monitorHealthCheck }) => ({
      id,
      url,
      monitorIntervalHours,
      monitorHealthCheck,
    }));
}

export async function scheduleNextMonitorRun(siteId: string): Promise<void> {
  const hours = await resolveMonitorIntervalHours(siteId);
  await prisma.site.update({
    where: { id: siteId },
    data: {
      nextRunAt: computeNextRunAt(hours),
      monitorIntervalHours: hours,
      monitorFailureCount: 0,
      monitorHealthCheck: false,
    },
  });
}

export async function scheduleMonitorFailureBackoff(siteId: string, failureCount: number): Promise<void> {
  const hours = computeFailureBackoffHours(failureCount);
  await prisma.site.update({
    where: { id: siteId },
    data: {
      nextRunAt: computeNextRunAt(hours),
      monitorFailureCount: failureCount,
      monitorHealthCheck: true,
    },
  });
}
