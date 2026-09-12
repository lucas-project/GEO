'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { isInterruptedJobError, isTerminalJobStatus, type PolledJob } from '@/lib/jobs';
import {
  notifyBackgroundJobsChanged,
  writeJobUiConfig,
} from '@/lib/background-job-persist';

export interface BackgroundJobUiOptions {
  label: string;
  viewHref?: string;
  viewLabel?: string;
  hideOnPathPrefix?: string;
  /** localStorage key for optional meta (viewHref, questionCount, …) */
  metaStorageKey?: string;
  /** Units for ETA seed: 60s + 45s × units (default 1) */
  etaUnits?: number;
}

export interface UseAsyncJobOptions<TPayload, TResult> {
  /** Prefix for React Query keys: `[queryKeyPrefix, jobId]` */
  queryKeyPrefix: string;
  mutationFn: (payload: TPayload) => Promise<{ jobId: string }>;
  pollIntervalMs?: number;
  /** Restore job id from localStorage on mount */
  persistKey?: string;
  /** Floating panel + sidebar progress when combined with persistKey (polled globally). */
  background?: BackgroundJobUiOptions;
  clearJobOnComplete?: boolean;
  clearJobOnFailed?: boolean;
  onCompleted?: (result: TResult | undefined, job: PolledJob<TResult>) => void;
  onFailed?: (error: string | undefined) => void;
}

export function useAsyncJob<TPayload, TResult = unknown>({
  queryKeyPrefix,
  mutationFn,
  pollIntervalMs = 1500,
  persistKey,
  background,
  clearJobOnComplete = false,
  clearJobOnFailed = true,
  onCompleted,
  onFailed,
}: UseAsyncJobOptions<TPayload, TResult>) {
  const backgroundRef = useRef(background);
  backgroundRef.current = background;

  const [jobId, setJobIdState] = useState<string | null>(() => {
    if (!persistKey || typeof window === 'undefined') return null;
    return localStorage.getItem(persistKey);
  });

  const setJobId = useCallback(
    (id: string | null) => {
      setJobIdState(id);
      if (!persistKey) return;
      if (id) {
        localStorage.setItem(persistKey, id);
        if (backgroundRef.current) writeJobUiConfig(persistKey, backgroundRef.current);
      } else {
        localStorage.removeItem(persistKey);
      }
      notifyBackgroundJobsChanged();
    },
    [persistKey],
  );

  const enqueue = useMutation({
    mutationFn,
    onSuccess: (data) => setJobId(data.jobId),
  });

  const jobQuery = useQuery<{ job: PolledJob<TResult> }>({
    queryKey: [queryKeyPrefix, jobId],
    enabled: Boolean(jobId),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
    refetchInterval: (q) => {
      const polled = q.state.data?.job;
      const status = polled?.status;
      if (status === 'completed' && polled?.result == null) {
        return Math.min(500, pollIntervalMs);
      }
      return isTerminalJobStatus(status) ? false : pollIntervalMs;
    },
    refetchIntervalInBackground: true,
    queryFn: async () => {
      if (!jobId) throw new Error('no job');
      return api.get<{ job: PolledJob<TResult> }>(`/api/jobs/${jobId}`);
    },
  });

  const jobNotFound =
    jobQuery.error instanceof ApiError && jobQuery.error.status === 404;

  useEffect(() => {
    if (jobId && jobNotFound) setJobId(null);
  }, [jobId, jobNotFound, setJobId]);

  const job = jobQuery.data?.job;
  const jobDone = isTerminalJobStatus(job?.status);
  const isRunning =
    enqueue.isPending || (Boolean(jobId) && !jobNotFound && !jobQuery.isError && !jobDone);

  const isInterrupted = isInterruptedJobError(job?.error);

  const handledKeyRef = useRef<string | null>(null);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);
  onCompletedRef.current = onCompleted;
  onFailedRef.current = onFailed;

  useEffect(() => {
    handledKeyRef.current = null;
  }, [jobId]);

  useEffect(() => {
    if (!job || !jobId) return;
    const key = `${jobId}:${job.status}`;
    if (handledKeyRef.current === key) return;

    if (job.status === 'completed') {
      if (job.result == null) return;
      handledKeyRef.current = key;
      onCompletedRef.current?.(job.result ?? undefined, job);
      if (clearJobOnComplete) setJobId(null);
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      handledKeyRef.current = key;
      onFailedRef.current?.(job.error);
      if (clearJobOnFailed) setJobId(null);
    }
  }, [job, jobId, clearJobOnComplete, clearJobOnFailed, setJobId]);

  const reset = useCallback(() => {
    setJobId(null);
    enqueue.reset();
  }, [setJobId, enqueue]);

  /** Cancel server job (if any) and always clear persisted job id so polling does not resume. */
  const cancelJob = useCallback(async () => {
    const id = jobId;
    if (id && (!job || !isTerminalJobStatus(job.status))) {
      try {
        await api.post<{ job: PolledJob<TResult> }>(`/api/jobs/${id}/cancel`, {});
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    }
    setJobId(null);
    enqueue.reset();
  }, [jobId, job, setJobId, enqueue]);

  const progress = job?.progress ?? 0;

  return {
    enqueue,
    mutate: enqueue.mutate,
    jobId,
    setJobId,
    job,
    jobQuery,
    isRunning,
    isInterrupted,
    progress,
    reset,
    cancelJob,
    etaLabel: null,
  };
}
