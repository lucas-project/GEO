'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Loader2, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { useAsyncJob } from '@/hooks/use-async-job';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';

const STORAGE_KEY = 'geo:audit-job';

interface AuditJobResult {
  auditId?: string;
}

export function AuditEntry() {
  const router = useRouter();
  const { targetUrl, setTargetUrl, registerCompletedAudit } = useWorkspaceTarget();
  const submittedUrlRef = useRef('');

  const { enqueue, mutate, jobId, job, jobQuery, isRunning, progress } = useAsyncJob<
    string,
    AuditJobResult
  >({
    queryKeyPrefix: 'job',
    persistKey: STORAGE_KEY,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (url) => api.post<{ jobId: string }>('/api/geo-audit', { url }),
    onCompleted: (result) => {
      if (result?.auditId) {
        registerCompletedAudit(result.auditId, submittedUrlRef.current);
        router.push(`/audit/${result.auditId}`);
      }
    },
  });

  const progressLabel = resolveJobProgressLabel({
    jobId,
    status: job?.status,
    progress,
    isQueryPending: jobQuery.isPending,
    isQueryError: jobQuery.isError,
    labels: {
      pending: 'Waiting in queue…',
      running: (pct) =>
        pct < 50
          ? 'Crawling pages…'
          : pct < 78
            ? 'Extracting content…'
            : pct < 88
              ? 'Scoring dimensions…'
              : pct < 96
                ? 'Generating narrative…'
                : 'Saving report…',
      completed: 'Complete — redirecting…',
      failed: 'Audit failed',
      cancelled: 'Cancelled',
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;
    submittedUrlRef.current = targetUrl.trim();
    mutate(targetUrl.trim());
  };

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-medium text-fg-muted uppercase tracking-wider">
          <Globe className="w-3.5 h-3.5" />
          Target URL
        </label>
        <p className="text-[11px] text-fg-muted mt-1">
          Uses the same URL as the workspace bar above. Change it there to update every phase.
        </p>
        <div className="flex gap-2">
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="example.com"
            disabled={isRunning}
            autoFocus
            className="flex-1"
          />
          <Button type="submit" disabled={!targetUrl.trim() || isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Auditing…
              </>
            ) : (
              <>
                Run audit
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </form>

      {enqueue.error && (
        <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
          {(enqueue.error as Error).message}
        </div>
      )}

      <JobProgress
        jobId={jobId}
        status={job?.status}
        progress={progress}
        error={job?.error}
        label={progressLabel}
        failedHint="The site may require more time or the crawler was blocked. Try again or check the URL."
      />

      <div className="mt-5 text-[11px] text-fg-subtle leading-relaxed">
        Enter a domain or full URL (https:// is optional). The audit will render the page with Chromium (so client-side hydration counts),
        extract entities + schema + chunks via the AI provider, and score 10 GEO dimensions.
      </div>
    </Card>
  );
}
