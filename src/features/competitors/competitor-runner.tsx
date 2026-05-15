'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Loader2, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import type { CompetitorComparison } from '@modules/competitor-analysis';
import { CompetitorComparisonResults } from './competitor-results';
import { useAsyncJob } from '@/hooks/use-async-job';

interface CmpJobResult {
  targetUrl?: string;
  comparisonId?: string;
}

export function CompetitorRunner() {
  const queryClient = useQueryClient();
  const { targetUrl, setTargetUrl } = useWorkspaceTarget();
  const [competitors, setCompetitors] = useState<string[]>(['']);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);

  const { mutate, isRunning, jobId, job, jobQuery } = useAsyncJob<void, CmpJobResult>({
    queryKeyPrefix: 'cmp-job',
    clearJobOnComplete: false,
    clearJobOnFailed: false,
    mutationFn: async () =>
      api.post<{ jobId: string }>('/api/competitor-analysis', {
        targetUrl: targetUrl.trim(),
        competitorUrls: competitors.map((c) => c.trim()).filter(Boolean),
      }),
    onCompleted: (result) => {
      if (result?.comparisonId) setActiveComparisonId(result.comparisonId);
      void queryClient.invalidateQueries({ queryKey: ['cmp-recent'] });
    },
  });

  const startComparison = () => {
    setActiveComparisonId(null);
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
        : job
          ? `${job.status} · ${job.progress}%`
          : '';

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
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
          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5 block">
            Competitors (up to 5)
          </label>
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
  );
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
          <div className="mt-2 text-[11px] text-fg-subtle">
            {new Date(c.createdAt).toLocaleString()}
            <span className="text-accent ml-2">View results</span>
          </div>
        </button>
      ))}
    </div>
  );
}

