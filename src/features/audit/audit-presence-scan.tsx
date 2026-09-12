'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import { usePresenceProbe } from '@/features/presence/presence-probe-context';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';

interface AuditPresenceScanProps {
  auditId: string;
  siteUrl: string;
}

export function AuditPresenceScan({ auditId, siteUrl }: AuditPresenceScanProps) {
  const router = useRouter();
  const { setTargetUrl } = useWorkspaceTarget();
  const {
    isRunning,
    jobId,
    job,
    jobQuery,
    progress,
    startProbe,
    cancelProbe,
  } = usePresenceProbe();

  useEffect(() => {
    if (siteUrl.trim()) setTargetUrl(siteUrl);
  }, [siteUrl, setTargetUrl]);

  useEffect(() => {
    if (!isRunning && job?.status === 'completed') {
      router.refresh();
    }
  }, [isRunning, job?.status, router]);

  const presenceUrl = '/presence';

  const progressLabel = resolveJobProgressLabel({
    jobId,
    status: job?.status,
    progress,
    isQueryPending: jobQuery.isPending,
    isQueryError: jobQuery.isError,
    labels: {
      running: (pct) => `Scanning platforms… ${pct}%`,
      completed: 'Scan complete — refreshing report',
      failed: 'Presence scan failed',
    },
  });

  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] text-fg-muted leading-snug">
        Run a deep Playwright probe across review and community sites (Whirlpool, ProductReview,
        OzBargain for .au domains; Quora and others globally). Updates this audit when complete
        (~2–4 min). Your audit score is not blocked while this runs.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startProbe()}
          disabled={isRunning}
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Radar className="h-3.5 w-3.5 mr-1.5" />
          )}
          Run deep presence scan
        </Button>
        <Link href={presenceUrl} className="text-[11px] text-accent hover:underline">
          Open presence workspace →
        </Link>
      </div>
      {isRunning && (
        <JobProgress
          active
          jobId={jobId}
          status={job?.status}
          progress={progress}
          error={job?.error}
          label={progressLabel || 'Presence scan running…'}
          cancelLabel="Stop"
          onCancel={() => void cancelProbe()}
        />
      )}
    </div>
  );
}
