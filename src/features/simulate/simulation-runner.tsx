'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { useAsyncJob } from '@/hooks/use-async-job';

const PLATFORM_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

interface SimulationRunData {
  id: string;
  platform: string;
  responseText: string;
  citations: Array<{ url: string | null; brand: string | null; domain: string | null; position: number }>;
  brandMentions: Array<{ brand: string; count: number }>;
}

interface SimulationResultData {
  runId: string;
  prompt: string;
  runs: SimulationRunData[];
  aggregate: {
    totalCitations: number;
    brandLeaderboard: Array<{ brand: string; count: number }>;
    domainLeaderboard: Array<{ domain: string; count: number }>;
    targetVisibility: { brand: string; mentionedOnPlatforms: string[]; visibilityScore: number } | null;
  };
}

interface SimJobResult {
  runId?: string;
}

const PRESETS = [
  'Best VRF air conditioning Australia',
  'Top AI SEO tools 2026',
  'Best CRM for small business',
  'How to add FAQ schema to a WordPress site',
];

export function SimulationRunner() {
  const queryClient = useQueryClient();
  const { targetUrl, targetBrand, setTargetBrand } = useWorkspaceTarget();
  const [prompt, setPrompt] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { mutate, isRunning } = useAsyncJob<void, SimJobResult>({
    queryKeyPrefix: 'sim-job',
    pollIntervalMs: 1200,
    clearJobOnComplete: true,
    mutationFn: async () =>
      api.post<{ jobId: string }>('/api/simulate-ai-search', {
        prompt: prompt.trim(),
        targetBrand: targetBrand.trim() || undefined,
        targetUrl: targetUrl.trim() || undefined,
      }),
    onCompleted: (result) => {
      if (result?.runId) setActiveRunId(result.runId);
    },
  });

  const startSimulation = () => {
    setActiveRunId(null);
    queryClient.removeQueries({ queryKey: ['sim-result'] });
    mutate();
  };

  const { data: result, isFetching: resultLoading } = useQuery<{ result: SimulationResultData }>({
    queryKey: ['sim-result', activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api.get(`/api/simulate-ai-search?runId=${activeRunId}`),
    staleTime: 0,
  });

  const isStaleMockRun =
    result?.result?.runs?.[0]?.responseText?.includes('Schema.org markup and FAQ blocks') ?? false;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="text-[11px] text-fg-subtle leading-relaxed mb-4">
          Simulates how ChatGPT, Gemini, Claude, and Perplexity might answer your prompt — which brands and
          domains they cite. Set your site in the workspace bar. For Midea / mdhome.com.au, track brand{' '}
          <strong className="font-medium text-fg-muted">Midea</strong> (mdhome is resolved automatically).
        </p>
        <div className="space-y-3">
          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Prompt
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Best AI SEO tools 2026"
            disabled={isRunning}
            rows={2}
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                disabled={isRunning}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border-subtle text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              >
                {p}
              </button>
            ))}
          </div>

          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mt-2 block">
            Target brand (optional — synced with workspace bar)
          </label>
          <Input
            value={targetBrand}
            onChange={(e) => setTargetBrand(e.target.value)}
            placeholder={targetUrl.trim() ? 'e.g. Midea — mdhome maps automatically' : 'Your brand to track visibility for'}
            disabled={isRunning}
          />
          {targetUrl.trim() && (
            <p className="text-[10px] text-fg-subtle">
              Workspace site: <span className="font-mono">{targetUrl.trim()}</span>
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button disabled={!prompt.trim() || isRunning} onClick={startSimulation}>
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running across 4 platforms…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Run simulation
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {isRunning && !result?.result && (
        <p className="text-xs text-fg-muted text-center py-4">Running new simulation…</p>
      )}

      {isStaleMockRun && (
        <p className="text-xs text-amber-600/90 dark:text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          This run used an older mock format. Click <strong>Run simulation</strong> again to refresh with
          HVAC-aware results.
        </p>
      )}

      {result?.result && !resultLoading && (
        <SimulationResultView result={result.result} runId={activeRunId} />
      )}
    </div>
  );
}

function SimulationResultView({
  result,
  runId,
}: {
  result: SimulationResultData;
  runId: string | null;
}) {
  return (
    <>
      {runId && <p className="text-[10px] text-fg-subtle font-mono mb-1">Run {runId}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Brand leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {result.aggregate.brandLeaderboard.length === 0 ? (
              <p className="text-xs text-fg-muted">No brand mentions detected.</p>
            ) : (
              <ul className="space-y-2">
                {result.aggregate.brandLeaderboard.map((b, i) => (
                  <li key={b.brand} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-fg-subtle tabular-nums w-5 text-xs">{i + 1}.</span>
                      <span className="text-fg">{b.brand}</span>
                    </span>
                    <Badge variant="accent">{b.count}×</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cited domains</CardTitle>
          </CardHeader>
          <CardContent>
            {result.aggregate.domainLeaderboard.length === 0 ? (
              <p className="text-xs text-fg-muted">No URLs cited.</p>
            ) : (
              <ul className="space-y-2">
                {result.aggregate.domainLeaderboard.map((d, i) => (
                  <li key={d.domain} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-fg-subtle tabular-nums w-5 text-xs">{i + 1}.</span>
                      <span className="text-fg font-mono">{d.domain}</span>
                    </span>
                    <Badge>{d.count}×</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aggregate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Stat label="Total citations" value={String(result.aggregate.totalCitations)} />
            <Stat label="Platforms queried" value={String(result.runs.length)} />
            {result.aggregate.targetVisibility && (
              <div className="pt-3 border-t border-border-subtle">
                <div className="text-fg-subtle uppercase tracking-wider text-[10px] mb-1">
                  Target visibility — {result.aggregate.targetVisibility.brand}
                </div>
                <div className="text-3xl font-semibold tabular-nums">
                  {result.aggregate.targetVisibility.visibilityScore}
                  <span className="text-base text-fg-muted">/100</span>
                </div>
                <div className="text-[11px] text-fg-muted mt-1">
                  Cited on {result.aggregate.targetVisibility.mentionedOnPlatforms.length} of 4 platforms
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-platform responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {result.runs.map((r) => (
            <PlatformResponseRow key={r.id} run={r} />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function PlatformResponseRow({ run }: { run: SimulationRunData }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        className="w-full p-3 flex items-center gap-3 hover:bg-bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-fg-subtle" /> : <ChevronRight className="w-4 h-4 text-fg-subtle" />}
        <span className="text-sm font-medium text-fg w-28">{PLATFORM_LABEL[run.platform] ?? run.platform}</span>
        <Badge variant="accent">{run.citations.length} citations</Badge>
        <span className="text-xs text-fg-muted truncate flex-1">{run.responseText.slice(0, 120)}</span>
      </button>
      {open && (
        <div className="border-t border-border-subtle p-3 space-y-3">
          <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed">{run.responseText}</p>
          {run.brandMentions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Mentions</div>
              <div className="flex flex-wrap gap-1.5">
                {run.brandMentions.map((m) => (
                  <Badge key={m.brand}>
                    {m.brand} ·{' '}
                    <span className="text-fg-muted ml-0.5 tabular-nums">{m.count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle uppercase tracking-wider text-[10px]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
