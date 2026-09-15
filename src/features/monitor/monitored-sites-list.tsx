'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Clock,
  ExternalLink,
  HeartPulse,
  Play,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { formatDate } from '@/lib/utils';
import { DualTrendSparkline } from './dual-trend-sparkline';
import type { JobStatus } from '@/lib/jobs';

export interface MonitoredSiteRow {
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
  visibilityTrend: number[];
}

const SCHEDULE_OPTIONS = [
  { label: 'Every 12 hours', preset: '12h' as const, hours: 12 },
  { label: 'Daily', preset: 'daily' as const, hours: 24 },
  { label: 'Weekly', preset: 'weekly' as const, hours: 168 },
  { label: 'Adaptive', preset: 'adaptive' as const, hours: 24 },
];

interface MonitoredSitesListProps {
  sites: MonitoredSiteRow[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  onRun: (siteId: string) => void;
  onRemove: (siteId: string) => void;
  onScheduleChange: (
    siteId: string,
    patch: {
      monitorEnabled?: boolean;
      monitorSchedulePreset?: string;
      monitorIntervalHours?: number;
    },
  ) => void;
  runningSiteId: string | null;
  runJobId: string | null;
  runStatus?: JobStatus;
  runProgress?: number;
}

export function MonitoredSitesList({
  sites,
  selectedSiteId,
  onSelectSite,
  onRun,
  onRemove,
  onScheduleChange,
  runningSiteId,
  runJobId,
  runStatus,
  runProgress = 0,
}: MonitoredSitesListProps) {
  if (sites.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Activity className="w-8 h-8 text-fg-subtle mx-auto mb-3" />
        <p className="text-sm text-fg-muted">No sites on daily monitoring yet.</p>
        <p className="text-xs text-fg-subtle mt-1">
          Enable monitoring from a GEO audit report or add a site below.
        </p>
      </Card>
    );
  }

  const sorted = [...sites].sort((a, b) => {
    const ta = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const tb = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    return tb - ta;
  });

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated text-left">
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium">
                Website
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium whitespace-nowrap">
                Latest update
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium">
                Historical heuristic
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium hidden md:table-cell">
                Pages
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium hidden lg:table-cell">
                Next run
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium hidden sm:table-cell">
                Schedule
              </th>
              <th className="px-4 py-3 text-[12px] uppercase tracking-wider text-fg-subtle font-medium w-[1%]" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <MonitoredSiteTableRow
                key={s.id}
                site={s}
                selected={selectedSiteId === s.id}
                isRunning={runningSiteId === s.id && Boolean(runJobId)}
                runProgress={runningSiteId === s.id ? runProgress : 0}
                runStatus={runningSiteId === s.id ? runStatus : undefined}
                onSelect={() => onSelectSite(s.id)}
                onRun={() => onRun(s.id)}
                onRemove={() => onRemove(s.id)}
                onScheduleChange={(patch) => onScheduleChange(s.id, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MonitoredSiteTableRow({
  site: s,
  selected,
  isRunning,
  runProgress,
  runStatus,
  onSelect,
  onRun,
  onRemove,
  onScheduleChange,
}: {
  site: MonitoredSiteRow;
  selected: boolean;
  isRunning: boolean;
  runProgress: number;
  runStatus?: JobStatus;
  onSelect: () => void;
  onRun: () => void;
  onRemove: () => void;
  onScheduleChange: (patch: {
    monitorEnabled?: boolean;
    monitorSchedulePreset?: string;
    monitorIntervalHours?: number;
  }) => void;
}) {
  const preset =
    SCHEDULE_OPTIONS.find((o) => o.preset === s.monitorSchedulePreset) ?? SCHEDULE_OPTIONS[1];

  return (
    <tr
      className={`border-b border-border-subtle last:border-0 transition-colors cursor-pointer ${
        selected ? 'bg-accent/10' : 'hover:bg-bg-subtle/50'
      }`}
      onClick={onSelect}
    >
      <td className="px-4 py-3 min-w-[200px]">
        <div className="flex items-center gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg truncate hover:text-accent inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {s.url.replace(/^https?:\/\//, '')}
            <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
          </a>
          {s.monitorEnabled && <MonitoredBadge href={undefined} className="hidden xl:inline-flex" />}
        </div>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {!s.monitorEnabled && <Badge variant="outline">Paused</Badge>}
          {s.alertCount > 0 && (
            <Badge variant="warning" className="gap-0.5">
              <AlertTriangle className="w-3 h-3" />
              {s.alertCount}
            </Badge>
          )}
          {s.monitorHealthCheck && (
            <Badge variant="outline" className="gap-0.5">
              <HeartPulse className="w-3 h-3" />
              Health
            </Badge>
          )}
          {s.lastMonitorStatus === 'failed' && <Badge variant="danger">Failed</Badge>}
          {isRunning && (
            <Badge variant="accent" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {runStatus === 'running' ? `${runProgress}%` : 'Queued…'}
            </Badge>
          )}
        </div>
        {isRunning && runStatus === 'running' && (
          <div className="mt-2 h-1 rounded-full bg-border overflow-hidden max-w-[200px]">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${runProgress}%` }}
            />
          </div>
        )}
        {(s.trend.length >= 2 || s.visibilityTrend.length >= 2) && (
          <div className="mt-2 hidden sm:block">
            <DualTrendSparkline
              scoreTrend={s.trend}
              visibilityTrend={s.visibilityTrend}
              width={200}
              height={40}
            />
          </div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-fg font-medium text-xs">
          {s.lastRunAt ? formatDate(s.lastRunAt) : '—'}
        </div>
        <div className="text-[12px] text-fg-subtle mt-0.5">
          {s.lastRunAt ? 'Last monitor run' : 'Not run yet'}
        </div>
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {s.lastScore !== null && s.lastAuditId ? (
          <Link href={`/audit/${s.lastAuditId}`} title="View latest audit report">
            <ScoreGauge score={s.lastScore} size="sm" />
          </Link>
        ) : s.lastScore !== null ? (
          <ScoreGauge score={s.lastScore} size="sm" />
        ) : (
          <span className="text-xs text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-xs text-fg-muted">
        {s.monitorPageUrls.length > 0 ? s.monitorPageUrls.length : 'All'}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-fg-muted whitespace-nowrap">
        {s.nextRunAt && s.monitorEnabled ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(s.nextRunAt).getTime() < Date.now() ? 'Overdue — check scheduler' : formatDate(s.nextRunAt)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
        <select
          className="text-[13px] bg-bg border border-border rounded px-2 py-1 max-w-[120px]"
          value={preset.preset}
          disabled={!s.monitorEnabled}
          onChange={(e) => {
            const opt = SCHEDULE_OPTIONS.find((o) => o.preset === e.target.value)!;
            onScheduleChange({
              monitorSchedulePreset: opt.preset,
              monitorIntervalHours: opt.hours,
            });
          }}
        >
          {SCHEDULE_OPTIONS.map((o) => (
            <option key={o.preset} value={o.preset}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end">
          <label className="sr-only">Enabled</label>
          <input
            type="checkbox"
            checked={s.monitorEnabled}
            onChange={(e) => onScheduleChange({ monitorEnabled: e.target.checked })}
            className="rounded border-border mr-1"
            title="Enable monitoring"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isRunning}
            title="Run now"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} title="Remove">
            <Trash2 className="w-4 h-4 text-danger" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
