'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { isTerminalJobStatus, type PolledJob } from '@/lib/jobs';

export interface UseAsyncJobOptions<TPayload, TResult> {
  /** Prefix for React Query keys: `[queryKeyPrefix, jobId]` */
  queryKeyPrefix: string;
  mutationFn: (payload: TPayload) => Promise<{ jobId: string }>;
  pollIntervalMs?: number;
  /** Restore job id from localStorage on mount */
  persistKey?: string;
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
  clearJobOnComplete = false,
  clearJobOnFailed = true,
  onCompleted,
  onFailed,
}: UseAsyncJobOptions<TPayload, TResult>) {
  const [jobId, setJobIdState] = useState<string | null>(() => {
    if (!persistKey || typeof window === 'undefined') return null;
    return localStorage.getItem(persistKey);
  });

  const setJobId = useCallback(
    (id: string | null) => {
      setJobIdState(id);
      if (!persistKey) return;
      if (id) localStorage.setItem(persistKey, id);
      else localStorage.removeItem(persistKey);
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
    refetchInterval: (q) => {
      const status = q.state.data?.job?.status;
      return isTerminalJobStatus(status) ? false : pollIntervalMs;
    },
    queryFn: async () => {
      if (!jobId) throw new Error('no job');
      return api.get<{ job: PolledJob<TResult> }>(`/api/jobs/${jobId}`);
    },
  });

  const job = jobQuery.data?.job;
  const jobDone = isTerminalJobStatus(job?.status);
  const isRunning = enqueue.isPending || (Boolean(jobId) && !jobQuery.isError && !jobDone);

  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    handledKeyRef.current = null;
  }, [jobId]);

  useEffect(() => {
    if (!job || !jobId) return;
    const key = `${jobId}:${job.status}`;
    if (handledKeyRef.current === key) return;

    if (job.status === 'completed') {
      handledKeyRef.current = key;
      onCompleted?.(job.result ?? undefined, job);
      if (clearJobOnComplete) setJobId(null);
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      handledKeyRef.current = key;
      onFailed?.(job.error);
      if (clearJobOnFailed) setJobId(null);
    }
  }, [job, jobId, clearJobOnComplete, clearJobOnFailed, onCompleted, onFailed, setJobId]);

  const reset = useCallback(() => {
    setJobId(null);
    enqueue.reset();
  }, [setJobId, enqueue]);

  return {
    enqueue,
    mutate: enqueue.mutate,
    jobId,
    setJobId,
    job,
    jobQuery,
    isRunning,
    progress: job?.progress ?? 0,
    reset,
  };
}
