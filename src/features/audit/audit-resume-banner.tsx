'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import {
  PENDING_AUDIT_REPORT_KEY,
  useGeoAuditJob,
} from './geo-audit-job-context';

export function AuditResumeBanner() {
  const {
    isRunning,
    jobId,
    job,
    jobQuery,
    progress,
    failedError,
    isInterrupted,
  } = useGeoAuditJob();
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);

  useEffect(() => {
    setPendingReportId(sessionStorage.getItem(PENDING_AUDIT_REPORT_KEY));
  }, [isRunning, job?.status]);

  if (isRunning && jobId) {
    const progressLabel = resolveJobProgressLabel({
      jobId,
      status: job?.status,
      progress,
      isQueryPending: jobQuery.isPending,
      isQueryError: jobQuery.isError,
      labels: {
        pending: 'Queued — audits run before Compare, Simulate, and background jobs',
        running: (pct) =>
          pct < 50
            ? 'Crawling pages…'
            : pct < 78
              ? 'Extracting content…'
              : pct < 88
                ? 'Scoring dimensions…'
                : 'Finishing report…',
        completed: 'Report ready',
        failed: isInterrupted ? 'Audit interrupted' : 'Audit failed',
        cancelled: 'Cancelled',
      },
    });

    return (
      <Card className="mb-6 border-accent/30 bg-accent/5 p-4">
        <div className="flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-fg">Audit running in the background</p>
            <p className="text-xs text-fg-muted mt-1">
              You can switch tabs — progress continues here. Audits are prioritized over other
              background jobs (Compare, Simulate, indexing).
            </p>
            <JobProgress
              jobId={jobId}
              status={job?.status}
              progress={progress}
              error={job?.error}
              label={progressLabel}
              className="mt-3"
            />
          </div>
        </div>
      </Card>
    );
  }

  if (failedError || !pendingReportId) return null;

  const jobResult = job?.result as { completion?: string; stopReason?: string } | undefined;
  const isPartial =
    jobResult?.completion === 'partial' ||
    (typeof jobResult === 'object' && jobResult != null && 'stopReason' in jobResult && Boolean(jobResult.stopReason));

  const dismissPending = () => {
    sessionStorage.removeItem(PENDING_AUDIT_REPORT_KEY);
    setPendingReportId(null);
  };

  return (
    <Card
      className={`mb-6 p-4 ${
        isPartial ? 'border-amber-400/30 bg-amber-400/5' : 'border-success/30 bg-success/5'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <CheckCircle2
            className={`w-5 h-5 shrink-0 mt-0.5 ${isPartial ? 'text-amber-500' : 'text-success'}`}
          />
          <div>
            <p className="text-sm font-medium text-fg">
              {isPartial ? 'Partial report ready' : 'Your audit report is ready'}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              {isPartial
                ? 'The audit stopped before full coverage. Open the report for directional findings, then rerun for a complete sample.'
                : 'Open the report to see scores, issues, and your improvement plan. It stays in Recent audits below.'}
            </p>
          </div>
        </div>
        <Link
          href={`/audit/${pendingReportId}`}
          onClick={dismissPending}
          className="inline-flex items-center justify-center gap-2 shrink-0 h-8 px-3 rounded-md text-sm font-medium bg-bg-muted hover:bg-bg-subtle border border-border transition-colors"
        >
          View report
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Card>
  );
}
