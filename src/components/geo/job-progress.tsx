'use client';

import type { JobStatus } from '@/lib/jobs';
import { Button } from '@/components/ui/button';

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
  /** Show panel when a terminal error was kept after job id was cleared from storage */
  forceShow?: boolean;
  status?: JobStatus;
  progress?: number;
  statusMessage?: string;
  error?: string;
  label: string;
  failedHint?: string;
  /** Elapsed wall time, e.g. "1:23" */
  elapsedLabel?: string;
  /** Estimated time remaining, e.g. "~2:15" */
  remainingLabel?: string | null;
  /** When true, prefix remaining with ~ (seed estimate before progress stabilizes). */
  remainingIsEstimate?: boolean;
  /** When true, show progress bar, timer, and % for pending / enqueue (not only status=running). */
  active?: boolean;
  /** @default Cancel */
  cancelLabel?: string;
  onCancel?: () => void;
  className?: string;
}

export function resolveJobProgressLabel(opts: {
  jobId: string | null;
  forceShow?: boolean;
  status?: JobStatus;
  progress?: number;
  isQueryPending?: boolean;
  isQueryError?: boolean;
  labels: JobProgressLabels;
}): string {
  const { jobId, forceShow, status, progress = 0, isQueryPending, isQueryError, labels } = opts;
  if (!jobId && !forceShow) return '';
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
  forceShow = false,
  status,
  progress = 0,
  statusMessage,
  error,
  label,
  failedHint,
  elapsedLabel,
  remainingLabel,
  remainingIsEstimate,
  active = false,
  cancelLabel = 'Cancel',
  onCancel,
  className = '',
}: JobProgressProps) {
  if ((!jobId && !forceShow && !active) || !label) return null;

  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';
  const inProgress =
    active || status === 'running' || status === 'pending' || (forceShow && !isFailed && !isCancelled);
  const barProgress = inProgress ? Math.max(progress, progress > 0 ? progress : 3) : 0;
  const showCancel =
    Boolean(onCancel) &&
    (status === 'running' || status === 'pending' || inProgress || isFailed || isCancelled);

  return (
    <div
      className={`mt-4 p-3 rounded-lg border ${
        isFailed || isCancelled
          ? 'bg-danger/10 border-danger/30'
          : 'bg-bg-muted/50 border-border-subtle'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <span
            className={`text-xs font-medium ${
              isFailed || isCancelled ? 'text-danger' : 'text-fg-muted'
            }`}
          >
            {label}
          </span>
          {inProgress && statusMessage && (
            <p className="text-[11px] text-fg-subtle mt-0.5 truncate">{statusMessage}</p>
          )}
          {inProgress && remainingLabel != null && (
            <p className="text-[11px] text-fg-subtle mt-0.5 tabular-nums">
              {remainingIsEstimate ? '~' : ''}
              {remainingLabel} left
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {inProgress && elapsedLabel && (
            <span className="text-[12px] text-fg-subtle tabular-nums">{elapsedLabel}</span>
          )}
          {inProgress && (
            <span className="text-[12px] text-fg-subtle tabular-nums">{progress}%</span>
          )}
          {showCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void onCancel?.()}
            >
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
      {inProgress && (
        <div className="w-full h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${barProgress}%` }}
          />
        </div>
      )}
      {(isFailed || isCancelled) && (
        <>
          {error && <p className="text-xs text-danger/80 mt-1 break-words">{error}</p>}
          {failedHint && <p className="text-xs text-fg-muted mt-2">{failedHint}</p>}
        </>
      )}
    </div>
  );
}
