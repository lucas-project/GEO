'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Plus,
  Play,
  TrendingDown,
  TrendingUp,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { useAsyncJob } from '@/hooks/use-async-job';
import {
  writeBackgroundJobMeta,
} from '@/features/workspace/background-jobs-context';
import {
  BACKGROUND_JOB_KEYS,
  BACKGROUND_JOB_META_KEYS,
} from '@/lib/background-job-keys';
import { formatDate } from '@/lib/utils';
import { MonitoredSitesList } from './monitored-sites-list';
import { MonitorSiteDetailPanel } from './monitor-site-detail-panel';

interface MonitoredSite {
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

interface AlertItem {
  alert: {
    id: string;
    severity: 'info' | 'warning' | 'regression';
    kind?: string;
    title: string;
    detail: string | null;
    dimension: string | null;
    delta: number | null;
  };
  siteUrl: string;
  siteId: string;
  runId: string;
  auditId: string | null;
  runAt: string;
}

const SCHEDULE_OPTIONS = [
  { label: 'Every 12 hours', preset: '12h' as const, hours: 12 },
  { label: 'Daily', preset: 'daily' as const, hours: 24 },
  { label: 'Weekly', preset: 'weekly' as const, hours: 168 },
  { label: 'Adaptive', preset: 'adaptive' as const, hours: 24 },
];

const KIND_LABELS: Record<string, string> = {
  score: 'Score',
  citation: 'Citation',
  visibility: 'Visibility',
  schema: 'Schema',
  structure: 'Structure',
  entity: 'Entity',
  readability: 'Readability',
  extraction: 'Extraction',
  competitor: 'Competitor',
  issue: 'Issue',
};

export function MonitorWorkspace() {
  const queryClient = useQueryClient();
  const { targetUrl } = useWorkspaceTarget();
  const [newUrl, setNewUrl] = useState('');
  const [addPreset, setAddPreset] = useState<(typeof SCHEDULE_OPTIONS)[number]['preset']>('daily');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runningSiteId, setRunningSiteId] = useState<string | null>(null);

  const { data } = useQuery<{ sites: MonitoredSite[]; alerts: AlertItem[] }>({
    queryKey: ['monitor'],
    queryFn: () => api.get('/api/monitor'),
    refetchInterval: (q) => {
      const sites = q.state.data?.sites ?? [];
      const anyRunning = sites.some((s) => s.lastMonitorStatus === 'running');
      return anyRunning || runningSiteId ? 2000 : 8000;
    },
  });

  const monitorRun = useAsyncJob<{ siteId: string }, { runId: string; auditId?: string | null }>({
    queryKeyPrefix: 'monitor-run-job',
    persistKey: BACKGROUND_JOB_KEYS.monitorRun,
    background: {
      label: 'Monitor check running',
      viewHref: '/monitor',
      hideOnPathPrefix: '/monitor',
      metaStorageKey: BACKGROUND_JOB_META_KEYS.monitorRun,
      etaUnits: 3,
    },
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: (payload) => {
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.monitorRun, {
        viewHref: '/monitor',
        siteId: payload.siteId,
      });
      return api.post('/api/monitor/run', payload);
    },
    onCompleted: () => {
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.monitorRun, null);
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
      if (selectedSiteId) {
        queryClient.invalidateQueries({ queryKey: ['monitor-site', selectedSiteId] });
      }
      setRunningSiteId(null);
    },
    onFailed: () => {
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.monitorRun, null);
      setRunningSiteId(null);
    },
  });

  const addSite = useMutation({
    mutationFn: () => {
      const opt = SCHEDULE_OPTIONS.find((o) => o.preset === addPreset)!;
      return api.post('/api/monitor', {
        url: newUrl.trim(),
        monitorSchedulePreset: opt.preset,
        monitorIntervalHours: opt.hours,
      });
    },
    onSuccess: () => {
      setNewUrl('');
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });

  const removeSite = useMutation({
    mutationFn: (siteId: string) => api.delete(`/api/monitor?siteId=${siteId}`),
    onSuccess: (_, siteId) => {
      if (selectedSiteId === siteId) {
        setSelectedSiteId(null);
        setSelectedRunId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });

  const runSweep = useMutation({
    mutationFn: () => api.post('/api/monitor/run', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor'] }),
  });

  const updateSchedule = useMutation({
    mutationFn: (input: {
      siteId: string;
      monitorEnabled?: boolean;
      monitorSchedulePreset?: string;
      monitorIntervalHours?: number;
      monitorPageUrls?: string[];
    }) => api.patch('/api/monitor', input),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-site', vars.siteId] });
    },
  });

  const sites = data?.sites ?? [];
  const alerts = data?.alerts ?? [];

  const handleRunSite = (siteId: string) => {
    setRunningSiteId(siteId);
    if (!selectedSiteId) setSelectedSiteId(siteId);
    monitorRun.mutate({ siteId });
  };

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId((prev) => (prev === siteId ? null : siteId));
    setSelectedRunId(null);
  };

  const handleSelectAlert = (item: AlertItem) => {
    setSelectedSiteId(item.siteId);
    setSelectedRunId(item.runId);
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5 block">
              Add site to continuous monitoring
            </label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="example.com"
              disabled={addSite.isPending}
            />
          </div>
          <select
            className="text-sm bg-bg border border-border rounded px-2 py-2"
            value={addPreset}
            onChange={(e) => setAddPreset(e.target.value as typeof addPreset)}
          >
            {SCHEDULE_OPTIONS.map((o) => (
              <option key={o.preset} value={o.preset}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!targetUrl.trim()}
            onClick={() => setNewUrl(targetUrl.trim())}
          >
            Use workspace URL
          </Button>
          <Button disabled={!newUrl.trim() || addSite.isPending} onClick={() => addSite.mutate()}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
          <Button
            variant="outline"
            disabled={runSweep.isPending || sites.length === 0}
            onClick={() => runSweep.mutate()}
          >
            <Play className="w-4 h-4" />
            Run due now
          </Button>
        </div>
        <p className="text-xs text-fg-muted mt-3">
          Click a row to manage monitored pages and view run history. Scores and alerts link to full
          audit reports.
        </p>
      </Card>

      <MonitoredSitesList
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={handleSelectSite}
        onRun={handleRunSite}
        onRemove={(siteId) => removeSite.mutate(siteId)}
        onScheduleChange={(siteId, patch) => updateSchedule.mutate({ siteId, ...patch })}
        runningSiteId={runningSiteId}
        runJobId={runningSiteId ? monitorRun.jobId : null}
        runStatus={monitorRun.job?.status}
        runProgress={monitorRun.progress}
      />

      {selectedSiteId && (
        <MonitorSiteDetailPanel
          siteId={selectedSiteId}
          onClose={() => {
            setSelectedSiteId(null);
            setSelectedRunId(null);
          }}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          onRunNow={() => handleRunSite(selectedSiteId)}
          runJobId={runningSiteId === selectedSiteId ? monitorRun.jobId : null}
          runStatus={runningSiteId === selectedSiteId ? monitorRun.job?.status : undefined}
          runProgress={runningSiteId === selectedSiteId ? monitorRun.progress : 0}
          runError={runningSiteId === selectedSiteId ? monitorRun.job?.error : undefined}
          isRunning={runningSiteId === selectedSiteId && monitorRun.isRunning}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              Recent alerts ({alerts.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-fg-muted">No meaningful deltas detected yet.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <AlertRow
                  key={`${a.runId}-${a.alert.id}`}
                  item={a}
                  onClick={() => handleSelectAlert(a)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertRow({ item, onClick }: { item: AlertItem; onClick: () => void }) {
  const { alert, siteUrl, runAt } = item;
  const Icon =
    alert.severity === 'regression' ? TrendingDown : alert.severity === 'info' ? TrendingUp : Info;
  const tone =
    alert.severity === 'regression'
      ? 'text-danger'
      : alert.severity === 'info'
        ? 'text-success'
        : 'text-warning';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-3 rounded-lg border border-border bg-bg-elevated text-left hover:border-accent/40 hover:bg-bg-subtle transition-colors"
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {alert.kind && (
              <Badge variant="outline" className="text-[12px]">
                {KIND_LABELS[alert.kind] ?? alert.kind}
              </Badge>
            )}
            <span className="text-sm font-medium text-fg">{alert.title}</span>
          </div>
          <div className="text-xs text-fg-muted mt-0.5">{alert.detail}</div>
          <div className="text-[13px] text-fg-subtle mt-1.5 flex items-center gap-2">
            <span className="font-mono truncate">{siteUrl}</span>
            <span className="text-fg-subtle/40">{'\u00b7'}</span>
            <span>{formatDate(runAt)}</span>
            <span className="text-fg-subtle/40">{'\u00b7'}</span>
            <span className="text-accent">View details</span>
          </div>
        </div>
      </div>
    </button>
  );
}
