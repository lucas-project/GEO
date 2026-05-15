'use client';

import type { JobStatus } from '@/lib/jobs';

export interface JobProgressLabels {
  queued?: string;
  fetchError?: string;
  pending?: string;
  running?: (progress: number) => string;
  completed?: string;
  failed?: string;
  cancelled?: string;
}

interface JobProgressProps {
  jobId: string | null;
  status?: JobStatus;
  progress?: number;
  error?: string;
  label: string;
  failedHint?: string;
  className?: string;
}

export function resolveJobProgressLabel(opts: {
  jobId: string | null;
  status?: JobStatus;
  progress?: number;
  isQueryPending?: boolean;
  isQueryError?: boolean;
  labels: JobProgressLabels;
}): string {
  const { jobId, status, progress = 0, isQueryPending, isQueryError, labels } = opts;
  if (!jobId) return '';
  if (isQueryPending) return labels.queued ?? 'Queued…';
  if (isQueryError) return labels.fetchError ?? 'Could not reach server';
  if (!status) return '';
  if (status === 'pending') return labels.pending ?? 'Waiting in queue…';
  if (status === 'running') {
    return labels.running ? labels.running(progress) : `Running… ${progress}%`;
  }
  if (status === 'completed') return labels.completed ?? 'Complete';
  if (status === 'failed') return labels.failed ?? 'Failed';
  if (status === 'cancelled') return labels.cancelled ?? 'Cancelled';
  return '';
}

export function JobProgress({
  jobId,
  status,
  progress = 0,
  error,
  label,
  failedHint,
  className = '',
}: JobProgressProps) {
  if (!jobId || !label) return null;

  const isFailed = status === 'failed';

  return (
    <div
      className={`mt-4 p-3 rounded-lg border ${
        isFailed ? 'bg-danger/10 border-danger/30' : 'bg-bg-muted/50 border-border-subtle'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-xs font-medium ${isFailed ? 'text-danger' : 'text-fg-muted'}`}>
          {label}
        </span>
        {status === 'running' && (
          <span className="text-[10px] text-fg-subtle tabular-nums">{progress}%</span>
        )}
      </div>
      {status === 'running' && (
        <div className="w-full h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {isFailed && (
        <>
          {error && <p className="text-xs text-danger/80 mt-1 break-words">{error}</p>}
          {failedHint && <p className="text-xs text-fg-muted mt-2">{failedHint}</p>}
        </>
      )}
    </div>
  );
}
