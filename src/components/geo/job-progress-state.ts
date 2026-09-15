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
  if (status === 'completed') return labels.completed ?? 'Complete';
  if (status === 'failed') return labels.failed ?? 'Failed';
  if (status === 'cancelled') return labels.cancelled ?? 'Cancelled';
  if (isQueryPending) return labels.queued ?? 'Queued…';
  if (isQueryError) return labels.fetchError ?? 'Could not reach server';
  if (status === 'pending') return labels.pending ?? 'Waiting in queue…';
  if (status === 'running') return labels.running ? labels.running(progress) : `Running… ${progress}%`;
  return '';
}
