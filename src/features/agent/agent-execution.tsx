'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Loader2,
  XCircle,
  Circle,
  Bot,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Square,
  MinusCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { canonicalSiteUrlFromGoal, extractWebsiteFromText } from '@/lib/website-url';

interface StepResult {
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string | null;
  finishedAt: string | null;
  output: unknown;
  error: string | null;
}

interface PlanRecord {
  id: string;
  goal: string;
  plan: { summary: string; steps: Array<Record<string, unknown> & { type: string; reason: string }> };
  status: 'planned' | 'running' | 'completed' | 'failed';
  results: StepResult[];
  createdAt: string;
}

const STEP_LABELS: Record<string, string> = {
  audit: 'Run GEO Audit',
  simulate: 'Simulate AI Search',
  'competitor-compare': 'Compare Competitors',
  'generate-fix': 'Generate Fix',
  'monitor-add': 'Add to Monitoring',
};

export function AgentExecution({ planId }: { planId: string }) {
  const queryClient = useQueryClient();
  const [runError, setRunError] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ plan: PlanRecord }>({
    queryKey: ['agent-plan', planId],
    queryFn: () => api.get(`/api/agent/plan/${planId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.plan?.status;
      return s === 'completed' || s === 'failed' ? false : 2000;
    },
  });

  const run = useMutation({
    mutationFn: () => api.post<{ jobId: string }>('/api/agent/run', { planId }),
    onMutate: () => {
      setRunError(null);
      setStopError(null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-plan', planId] }),
    onError: (err) => {
      setRunError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const stop = useMutation({
    mutationFn: () => api.post<{ revertedToPlanned: boolean }>(`/api/agent/plan/${planId}/stop`, {}),
    onMutate: () => setStopError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-plan', planId] }),
    onError: (err) => {
      setStopError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const replan = useMutation({
    mutationFn: () => api.post<{ planId: string }>(`/api/agent/plan/${planId}/replan`, {}),
    onSuccess: () => {
      setRunError(null);
      queryClient.invalidateQueries({ queryKey: ['agent-plan', planId] });
    },
    onError: (err) => {
      setRunError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  if (isLoading || !data) return <div className="text-sm text-fg-muted">Loading plan…</div>;
  const plan = data.plan;
  const failedStep = plan.results.find((r) => r.status === 'failed');
  const hasNoSteps = (plan.plan.steps ?? []).length === 0;
  const siteFromGoal = extractWebsiteFromText(plan.goal);
  const auditStep = plan.plan.steps?.find((s) => s.type === 'audit');
  const auditUrlResolved =
    siteFromGoal ??
    (auditStep && typeof auditStep.url === 'string'
      ? canonicalSiteUrlFromGoal(plan.goal, auditStep.url)
      : null);

  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to workspace
      </Link>

      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1 flex items-center gap-1.5">
            <Bot className="w-3 h-3" />
            Agent plan
          </div>
          <h1 className="text-2xl font-semibold">{plan.goal}</h1>
          <p className="mt-2 text-sm text-fg-muted">{plan.plan.summary ?? ''}</p>
          {auditUrlResolved && (
            <p className="mt-2 text-[13px] text-fg-subtle">
              Site URL for audit:{' '}
              <span className="font-mono text-fg">{auditUrlResolved}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 max-w-sm">
          <div className="flex flex-wrap justify-end gap-2">
            {plan.status === 'running' ? (
              <>
                <Button type="button" disabled variant="secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running…
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate()}
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={replan.isPending || run.isPending}
                  onClick={() => replan.mutate()}
                >
                  {replan.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Refresh plan'
                  )}
                </Button>
                <Button
                  type="button"
                  disabled={run.isPending || replan.isPending}
                  onClick={() => run.mutate()}
                >
                  <Play className="w-4 h-4" />
                  {plan.status === 'planned' ? 'Run plan' : 'Re-run'}
                </Button>
              </>
            )}
          </div>
          {runError && (
            <p className="text-xs text-danger text-right" role="alert">
              {runError}
            </p>
          )}
          {stopError && (
            <p className="text-xs text-danger text-right" role="alert">
              {stopError}
            </p>
          )}
        </div>
      </div>

      {hasNoSteps && (
        <p className="text-sm text-amber-600/90 dark:text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          This plan has no runnable steps. Edit your goal to include a website (e.g.{' '}
          <span className="font-mono">mdhome.com.au</span>) or a clear task.
        </p>
      )}

      {failedStep?.error && (
        <p className="text-sm text-danger rounded-lg border border-danger/30 bg-danger/5 px-4 py-3" role="alert">
          <strong className="font-medium">Step failed:</strong> {failedStep.error}
          {failedStep.error.includes('ERR_NAME_NOT_RESOLVED') && (
            <span className="block mt-2 text-fg-muted text-xs">
              The site URL may have been truncated. Re-dispatch your goal with the full domain (e.g.{' '}
              <span className="font-mono">mdhome.com.au</span>), then run the plan again.
            </span>
          )}
          {failedStep.error.includes('Playwright') && (
            <span className="block mt-2 text-fg-muted text-xs">
              Install the browser: <span className="font-mono">npx playwright install chromium</span>
            </span>
          )}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Execution
            <Badge variant={plan.status === 'completed' ? 'success' : plan.status === 'failed' ? 'danger' : 'accent'} className="ml-2">
              {plan.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(plan.plan.steps ?? []).map((step, i) => (
            <StepRow
              key={i}
              index={i}
              step={step}
              result={plan.results[i] ?? null}
            />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function StepRow({
  index,
  step,
  result,
}: {
  index: number;
  step: Record<string, unknown> & { type: string; reason: string };
  result: StepResult | null;
}) {
  const [open, setOpen] = useState(false);
  const status = result?.status ?? 'pending';

  const Icon =
    status === 'completed'
      ? CheckCircle2
      : status === 'running'
        ? Loader2
        : status === 'failed'
          ? XCircle
          : status === 'skipped'
            ? MinusCircle
            : Circle;
  const tone =
    status === 'completed'
      ? 'text-success'
      : status === 'running'
        ? 'text-accent'
        : status === 'failed'
          ? 'text-danger'
          : status === 'skipped'
            ? 'text-fg-muted'
            : 'text-fg-subtle';

  const title = STEP_LABELS[step.type] ?? step.type;
  const link = stepLink(step, result);

  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-bg-muted/40 transition-colors"
      >
        <Icon className={`w-4 h-4 shrink-0 ${tone} ${status === 'running' ? 'animate-spin' : ''}`} />
        <span className="text-xs font-mono text-fg-subtle w-6">{String(index + 1).padStart(2, '0')}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-fg flex items-center gap-2">
            <span>{title}</span>
            <Badge variant="outline">{step.type}</Badge>
          </div>
          <div className="text-[13px] text-fg-muted truncate mt-0.5">{step.reason}</div>
        </div>
        {link && (
          <Link href={link} className="text-[13px] text-accent hover:underline shrink-0 inline-flex items-center gap-1">
            View <ExternalLink className="w-3 h-3" />
          </Link>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-fg-subtle" /> : <ChevronRight className="w-4 h-4 text-fg-subtle" />}
      </button>
      {open && (
        <div className="border-t border-border-subtle p-3 space-y-2 bg-bg-subtle/30">
          <Detail label="Parameters" value={JSON.stringify(step, null, 2)} />
          {result?.output !== undefined && result?.output !== null && (
            <Detail label="Output" value={JSON.stringify(result.output, null, 2)} />
          )}
          {result?.error && (
            <Detail
              label={result.status === 'skipped' ? 'Note' : 'Error'}
              value={result.error}
              variant={result.status === 'failed' ? 'danger' : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

function stepLink(step: Record<string, unknown>, result: StepResult | null): string | null {
  if (!result || result.status !== 'completed') return null;
  const out = (result.output ?? {}) as Record<string, unknown>;
  if (step.type === 'audit' && typeof out.auditId === 'string') return `/audit/${out.auditId}`;
  if (step.type === 'competitor-compare') return '/competitors';
  if (step.type === 'simulate') return '/simulate';
  if (step.type === 'generate-fix' && typeof out.artifactId === 'string') return `/optimize`;
  if (step.type === 'monitor-add') return '/monitor';
  return null;
}

function Detail({ label, value, variant }: { label: string; value: string; variant?: 'danger' }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1">{label}</div>
      <pre
        className={`text-[13px] font-mono whitespace-pre-wrap break-all rounded border border-border-subtle p-2 ${
          variant === 'danger' ? 'text-danger bg-danger/5' : 'text-fg-muted bg-bg'
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
