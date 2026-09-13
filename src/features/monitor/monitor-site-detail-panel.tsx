'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Play,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { JobProgress } from '@/components/geo/job-progress';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { api } from '@/lib/api-client';
import { canonicalPageUrl } from '@/lib/website-url';
import { formatDate } from '@/lib/utils';
import { discoverSitePages } from '@/features/audit/audit-page-picker';
import { DualTrendSparkline, summarizeDualTrend } from './dual-trend-sparkline';
import type { MonitoredSiteDetail } from '@modules/monitoring';
import type { JobStatus } from '@/lib/jobs';
import { MonitorRunDetail } from './monitor-run-detail';

const SCHEDULE_OPTIONS = [
  { label: 'Every 12 hours', preset: '12h' as const, hours: 12 },
  { label: 'Daily', preset: 'daily' as const, hours: 24 },
  { label: 'Weekly', preset: 'weekly' as const, hours: 168 },
  { label: 'Adaptive', preset: 'adaptive' as const, hours: 24 },
];

interface MonitorSiteDetailPanelProps {
  siteId: string;
  onClose: () => void;
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  onRunNow: () => void;
  runJobId: string | null;
  runStatus?: JobStatus;
  runProgress?: number;
  runError?: string;
  isRunning: boolean;
}

export function MonitorSiteDetailPanel({
  siteId,
  onClose,
  selectedRunId,
  onSelectRun,
  onRunNow,
  runJobId,
  runStatus,
  runProgress = 0,
  runError,
  isRunning,
}: MonitorSiteDetailPanelProps) {
  const queryClient = useQueryClient();
  const [pageInput, setPageInput] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([]);

  const { data: detail, isLoading } = useQuery<MonitoredSiteDetail>({
    queryKey: ['monitor-site', siteId],
    queryFn: () => api.get(`/api/monitor/${siteId}`),
  });

  const updatePages = useMutation({
    mutationFn: (monitorPageUrls: string[]) =>
      api.patch('/api/monitor', { siteId, monitorPageUrls }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-site', siteId] });
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });

  const selectedRun = useMemo(
    () => detail?.runs.find((r) => r.id === selectedRunId) ?? null,
    [detail, selectedRunId],
  );

  const trendSummary = useMemo(() => {
    if (!detail) return null;
    return summarizeDualTrend(detail.trend, detail.visibilityTrend);
  }, [detail]);

  const addPage = (raw: string) => {
    if (!detail || !raw.trim()) return;
    const canon = canonicalPageUrl(raw.trim(), detail.url);
    const next = [...new Set([...detail.monitorPageUrls, canon])];
    updatePages.mutate(next);
    setPageInput('');
  };

  const removePage = (url: string) => {
    if (!detail) return;
    const next = detail.monitorPageUrls.filter((u) => u !== url);
    if (next.length === 0) return;
    updatePages.mutate(next);
  };

  const discover = async () => {
    if (!detail) return;
    setDiscovering(true);
    try {
      const result = await discoverSitePages(detail.url);
      const urls = result.pages.map((p) => canonicalPageUrl(p.url, detail.url));
      setDiscoveredUrls(urls);
    } finally {
      setDiscovering(false);
    }
  };

  if (isLoading || !detail) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-sm text-fg-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading site details…
      </Card>
    );
  }

  const preset =
    SCHEDULE_OPTIONS.find((o) => o.preset === detail.monitorSchedulePreset) ??
    SCHEDULE_OPTIONS[1];

  return (
    <Card className="border-accent/30 overflow-hidden">
      <CardHeader className="border-b border-border-subtle bg-bg-elevated py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <span className="truncate">{detail.url.replace(/^https?:\/\//, '')}</span>
              {detail.monitorEnabled && <MonitoredBadge href={undefined} />}
            </CardTitle>
            <p className="text-xs text-fg-muted mt-1">
              {detail.monitorPageUrls.length} page{detail.monitorPageUrls.length !== 1 ? 's' : ''}{' '}
              monitored · {preset.label.toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" onClick={onRunNow} disabled={isRunning}>
              <Play className="w-3.5 h-3.5" />
              Run now
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <JobProgress
          jobId={runJobId}
          status={runStatus}
          progress={runProgress}
          error={runError}
          label={
            isRunning
              ? runProgress < 20
                ? 'Starting monitor…'
                : runProgress < 82
                  ? 'Running GEO audit…'
                  : 'Comparing results…'
              : ''
          }
        />

        {(detail.trend.length >= 2 || detail.visibilityTrend.length >= 2) && (
          <section>
            <h3 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">
              Score vs AI citations
            </h3>
            <DualTrendSparkline
              scoreTrend={detail.trend}
              visibilityTrend={detail.visibilityTrend}
              width={280}
              height={44}
            />
            {trendSummary && (
              <p className="mt-2 text-xs text-fg-muted leading-relaxed">{trendSummary}</p>
            )}
          </section>
        )}

        <section>
          <h3 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">
            Monitored pages
          </h3>
          <ul className="space-y-1.5 mb-3 max-h-36 overflow-auto">
            {detail.monitorPageUrls.map((pageUrl) => (
              <li
                key={pageUrl}
                className="flex items-center justify-between gap-2 text-xs rounded border border-border-subtle px-2 py-1.5 bg-bg-elevated"
              >
                <span className="truncate text-fg-muted">{pageUrl}</span>
                <button
                  type="button"
                  className="text-fg-subtle hover:text-danger shrink-0"
                  disabled={detail.monitorPageUrls.length <= 1 || updatePages.isPending}
                  onClick={() => removePage(pageUrl)}
                  title="Remove page"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              placeholder="https://example.com/page"
              className="flex-1 min-w-[160px] text-xs h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addPage(pageInput);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pageInput.trim() || updatePages.isPending}
              onClick={() => addPage(pageInput)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={discovering}
              onClick={() => void discover()}
            >
              {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Discover'}
            </Button>
          </div>
          {discoveredUrls.length > 0 && (
            <div className="mt-2 rounded border border-border-subtle p-2 max-h-32 overflow-auto space-y-1">
              <p className="text-[12px] text-fg-subtle mb-1">From sitemap — click to add</p>
              {discoveredUrls
                .filter((u) => !detail.monitorPageUrls.includes(u))
                .slice(0, 20)
                .map((u) => (
                  <button
                    key={u}
                    type="button"
                    className="block w-full text-left text-[13px] text-accent hover:underline truncate"
                    onClick={() => addPage(u)}
                  >
                    + {u}
                  </button>
                ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">
            Run history
          </h3>
          {detail.runs.length === 0 ? (
            <p className="text-xs text-fg-muted">No monitor runs yet. Click Run now above.</p>
          ) : (
            <div className="space-y-1">
              {detail.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id === selectedRunId ? null : run.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedRunId === run.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border-subtle hover:bg-bg-subtle'
                  }`}
                >
                  {run.overallScore !== null ? (
                    <ScoreGauge score={run.overallScore} size="sm" />
                  ) : (
                    <span className="w-12 text-center text-xs text-fg-subtle">—</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-fg">{formatDate(run.runAt)}</div>
                    <div className="text-[12px] text-fg-subtle mt-0.5">
                      {run.alerts.length} alert{run.alerts.length !== 1 ? 's' : ''}
                      {run.overallDelta != null && run.overallDelta !== 0 && (
                        <span className={run.overallDelta > 0 ? ' text-success' : ' text-danger'}>
                          {' '}
                          · {run.overallDelta > 0 ? '+' : ''}
                          {run.overallDelta} overall
                        </span>
                      )}
                    </div>
                  </div>
                  {run.auditId && (
                    <Link
                      href={`/audit/${run.auditId}`}
                      className="text-[12px] text-accent hover:underline shrink-0 flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Report
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                  <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedRun && (
          <MonitorRunDetail
            run={selectedRun}
            siteUrl={detail.url}
            onClose={() => onSelectRun(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
