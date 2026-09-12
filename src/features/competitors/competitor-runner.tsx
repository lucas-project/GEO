'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Plus, X, Loader2, TrendingUp, Lightbulb } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { sameTargetSite } from '@/lib/website-url';
import { AuditFirstGate } from '@/features/workspace/audit-first-gate';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import type { CompetitorComparison } from '@modules/competitor-analysis';
import type { GeoAuditResult } from '@modules/geo-audit';
import { CompetitorComparisonResults } from './competitor-results';
import { useAsyncJob } from '@/hooks/use-async-job';
import { BACKGROUND_JOB_KEYS } from '@/lib/background-job-keys';
import { BACKGROUND_JOB_UI } from '@/lib/background-job-ui';

interface CmpJobResult {
  targetUrl?: string;
  comparisonId?: string;
}

function hostnameFromStoredUrl(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    try {
      return new URL(u.includes('://') ? u : `https://${u}`).hostname;
    } catch {
      return u;
    }
  }
}

export function CompetitorRunner() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { targetUrl, setTargetUrl, lastAuditId, lastAuditForUrl, hydrated } = useWorkspaceTarget();
  const [competitors, setCompetitors] = useState<string[]>(['']);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const enrichAttemptedRef = useRef<string | null>(null);

  const { data: resolvedAuditId, isLoading: resolvingAudit } = useQuery<string | null>({
    queryKey: ['cmp-audit-id', targetUrl, lastAuditId, lastAuditForUrl],
    enabled: hydrated && Boolean(targetUrl.trim()),
    queryFn: async () => {
      const url = targetUrl.trim();
      if (lastAuditId && lastAuditForUrl && sameTargetSite(lastAuditForUrl, url)) {
        return lastAuditId;
      }
      const res = await api.get<{ auditId: string | null }>(
        `/api/geo-audit?url=${encodeURIComponent(url)}`,
      );
      return res.auditId;
    },
    staleTime: 60_000,
  });

  const effectiveAuditId = resolvedAuditId ?? null;

  useEffect(() => {
    setSuggestionsApplied(false);
    enrichAttemptedRef.current = null;
    setDetectError(null);
  }, [effectiveAuditId]);

  const { data: auditData, isLoading: auditLoading, isFetching: auditFetching } = useQuery<{ audit: GeoAuditResult }>({
    queryKey: ['cmp-audit-suggestions', effectiveAuditId],
    enabled: Boolean(effectiveAuditId),
    queryFn: () => api.get(`/api/geo-audit/${effectiveAuditId}`),
    staleTime: 5 * 60 * 1000,
  });

  const suggestedCompetitors = auditData?.audit?.scoringMeta?.suggestedCompetitors ?? [];

  const { mutate: triggerDetect, isRunning: isDetecting } = useAsyncJob<
    void,
    { prompts?: number; competitors?: number }
  >({
    queryKeyPrefix: `cmp-enrich-${effectiveAuditId ?? 'none'}`,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async () => {
      if (!effectiveAuditId) throw new Error('No audit to enrich');
      return api.post<{ jobId: string }>(`/api/geo-audit/${effectiveAuditId}/enrich-suggestions`, {
        questionTypes: { brand: false, discovery: false },
      });
    },
    onCompleted: async (result) => {
      setDetectError(null);
      await queryClient.invalidateQueries({ queryKey: ['cmp-audit-suggestions', effectiveAuditId] });
      if ((result?.competitors ?? 0) === 0) {
        setDetectError('Could not detect competitors automatically. Add URLs manually or check AI/Serper config.');
      }
    },
    onFailed: (error) => {
      setDetectError(error ?? 'Competitor detection failed. Add URLs manually.');
    },
  });

  // Auto-detect competitors when audit exists but suggestions are empty
  useEffect(() => {
    if (!effectiveAuditId || auditLoading || auditFetching || isDetecting) return;
    if (suggestionsApplied) return;
    if (suggestedCompetitors.length > 0) return;
    if (enrichAttemptedRef.current === effectiveAuditId) return;

    enrichAttemptedRef.current = effectiveAuditId;
    triggerDetect();
  }, [
    effectiveAuditId,
    auditLoading,
    auditFetching,
    isDetecting,
    suggestionsApplied,
    suggestedCompetitors.length,
    triggerDetect,
  ]);

  // Apply suggestions from URL query param (from NextStepsRail link) or from audit on first load
  useEffect(() => {
    if (suggestionsApplied) return;

    const fromQuery = searchParams.get('suggested');
    if (fromQuery) {
      const urls = fromQuery.split(',').map((u) => u.trim()).filter(Boolean);
      if (urls.length > 0) {
        setCompetitors([...urls, ''].slice(0, 5));
        setSuggestionsApplied(true);
        return;
      }
    }

    if (suggestedCompetitors.length > 0) {
      setCompetitors([...suggestedCompetitors.slice(0, 4), '']);
      setSuggestionsApplied(true);
    }
  }, [suggestedCompetitors, searchParams, suggestionsApplied]);

  // Sync target URL from query param
  useEffect(() => {
    const fromQuery = searchParams.get('target')?.trim();
    if (fromQuery) setTargetUrl(fromQuery);
  }, [searchParams, setTargetUrl]);

  const { mutate, isRunning, jobId, job, jobQuery, cancelJob } = useAsyncJob<void, CmpJobResult>({
    queryKeyPrefix: 'cmp-job',
    persistKey: BACKGROUND_JOB_KEYS.competitor,
    background: BACKGROUND_JOB_UI.competitor,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async () =>
      api.post<{ jobId: string }>('/api/competitor-analysis', {
        targetUrl: targetUrl.trim(),
        competitorUrls: competitors.map((c) => c.trim()).filter(Boolean),
      }),
    onCompleted: (result) => {
      setLastError(null);
      if (result?.comparisonId) setActiveComparisonId(result.comparisonId);
      void queryClient.invalidateQueries({ queryKey: ['cmp-recent'] });
    },
    onFailed: (error) => {
      setLastError(error ?? 'Comparison failed. Check competitor URLs and try again.');
    },
  });

  const startComparison = () => {
    setActiveComparisonId(null);
    setLastError(null);
    mutate();
  };

  const detailQuery = useQuery<{ comparison: CompetitorComparison }>({
    queryKey: ['cmp-detail', activeComparisonId],
    enabled: Boolean(activeComparisonId),
    queryFn: () => api.get(`/api/competitor-analysis/${activeComparisonId}`),
    retry: 2,
    retryDelay: 400,
  });

  const progressMsg = !jobId
    ? ''
    : jobQuery.isPending
      ? 'Queued…'
      : jobQuery.isError
        ? jobQuery.error instanceof Error
          ? jobQuery.error.message
          : 'Failed to load job status'
        : job?.status === 'failed'
          ? 'Comparison failed'
          : job
            ? `${job.status} · ${job.progress}%`
            : '';

  const hasSuggestions = suggestedCompetitors.length > 0;
  const appliedSuggestionsCount = competitors.filter((c) => c.trim() && suggestedCompetitors.includes(c.trim())).length;
  const isLoadingSuggestions =
    resolvingAudit || auditLoading || (Boolean(effectiveAuditId) && isDetecting && !hasSuggestions);

  if (!hydrated || resolvingAudit) {
    return null;
  }

  return (
    <AuditFirstGate featureName="competitor comparison" bypassAuditId={effectiveAuditId}>
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        {isLoadingSuggestions && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-muted/40 border border-border text-[13px] text-fg-muted">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            Detecting competitors from your latest audit…
          </div>
        )}

        {detectError && !isDetecting && (
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-danger/5 border border-danger/20">
            <p className="text-[13px] text-fg-muted leading-relaxed">{detectError}</p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isDetecting || !effectiveAuditId}
              onClick={() => {
                if (!effectiveAuditId) return;
                enrichAttemptedRef.current = null;
                setDetectError(null);
                triggerDetect();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {hasSuggestions && appliedSuggestionsCount > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
            <Lightbulb className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <p className="text-[13px] text-fg-muted leading-relaxed">
              {appliedSuggestionsCount} competitor{appliedSuggestionsCount !== 1 ? 's' : ''} suggested by AI based on your latest audit. You can replace any of them.
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5 block">
            Your site
          </label>
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="yoursite.com"
            disabled={isRunning}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-fg-muted uppercase tracking-wider">
              Competitors (up to 5)
            </label>
            {hasSuggestions && !suggestionsApplied && !isLoadingSuggestions && (
              <button
                className="text-[12px] text-accent hover:underline flex items-center gap-1"
                onClick={() => {
                  setCompetitors([...suggestedCompetitors.slice(0, 4), '']);
                  setSuggestionsApplied(true);
                }}
              >
                <Lightbulb className="w-3 h-3" />
                Use AI suggestions
              </button>
            )}
            {!hasSuggestions && !isLoadingSuggestions && effectiveAuditId && (
              <button
                className="text-[12px] text-accent hover:underline flex items-center gap-1"
                disabled={isDetecting}
                onClick={() => {
                  enrichAttemptedRef.current = null;
                  setDetectError(null);
                  triggerDetect();
                }}
              >
                <Lightbulb className="w-3 h-3" />
                Detect competitors
              </button>
            )}
          </div>
          <div className="space-y-2">
            {competitors.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={c}
                  onChange={(e) => {
                    const next = [...competitors];
                    next[i] = e.target.value;
                    setCompetitors(next);
                  }}
                  placeholder="competitor.com"
                  disabled={isRunning}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={competitors.length === 1 || isRunning}
                  onClick={() => setCompetitors(competitors.filter((_, idx) => idx !== i))}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {competitors.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isRunning}
                onClick={() => setCompetitors([...competitors, ''])}
              >
                <Plus className="w-3.5 h-3.5" />
                Add competitor
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-fg-muted font-mono">{progressMsg}</div>
          <Button
            disabled={
              !targetUrl.trim() ||
              competitors.every((c) => !c.trim()) ||
              isRunning
            }
            onClick={startComparison}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Comparing…
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                Run comparison
              </>
            )}
          </Button>
        </div>

        {lastError && (
          <p className="text-xs text-danger rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 whitespace-pre-wrap">
            {lastError}
          </p>
        )}
      </Card>

      {activeComparisonId && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison results</CardTitle>
          </CardHeader>
          <CardContent>
            {detailQuery.isPending && <p className="text-sm text-fg-muted">Loading results…</p>}
            {detailQuery.isError && (
              <p className="text-sm text-danger" role="alert">
                Could not load this comparison. Try selecting it again from the list below.
              </p>
            )}
            {detailQuery.data?.comparison && (
              <CompetitorComparisonResults data={detailQuery.data.comparison} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent comparisons</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentComparisons
            selectedId={activeComparisonId}
            onSelect={(id) => setActiveComparisonId(id)}
          />
        </CardContent>
      </Card>
    </div>
    </AuditFirstGate>
  );
}

function RecentComparisons({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data } = useQuery<{
    comparisons: Array<{ id: string; targetUrl: string; competitorUrls: string[]; createdAt: string }>;
  }>({
    queryKey: ['cmp-recent'],
    queryFn: () => api.get('/api/competitor-analysis'),
    refetchInterval: 4000,
  });

  if (!data?.comparisons.length) {
    return <p className="text-sm text-fg-muted">No comparisons yet.</p>;
  }

  return (
    <div className="space-y-2">
      {data.comparisons.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-bg-muted/40 ${
            selectedId === c.id
              ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
              : 'border-border bg-bg-elevated'
          }`}
        >
          <div className="text-sm font-medium text-fg truncate">{c.targetUrl}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {c.competitorUrls.map((u) => (
              <Badge key={u} variant="outline">
                vs {hostnameFromStoredUrl(u)}
              </Badge>
            ))}
          </div>
          <div className="mt-2 text-[13px] text-fg-subtle">
            {new Date(c.createdAt).toLocaleString()}
            <span className="text-accent ml-2">View results</span>
          </div>
        </button>
      ))}
    </div>
  );
}
