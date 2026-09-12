'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api-client';
import { isInterruptedJobError } from '@/lib/jobs';
import { useAsyncJob } from '@/hooks/use-async-job';
import { BACKGROUND_JOB_KEYS } from '@/lib/background-job-keys';
import { BACKGROUND_JOB_UI } from '@/lib/background-job-ui';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import type { GenerateGeoContentResult } from '@modules/geo-content';

const JOB_STORAGE_KEY = BACKGROUND_JOB_KEYS.content;
const RESULT_STORAGE_KEY = 'geo:content-result';

function readStoredResult(): GenerateGeoContentResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GenerateGeoContentResult;
    return parsed?.auditId && parsed?.pack ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredResult(result: GenerateGeoContentResult | null): void {
  if (typeof window === 'undefined') return;
  if (!result) {
    sessionStorage.removeItem(RESULT_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
}

type GeoContentJobContextValue = {
  result: GenerateGeoContentResult | null;
  resultError: string | null;
  failedError: string | null;
  isInterrupted: boolean;
  isRunning: boolean;
  jobId: string | null;
  job: ReturnType<typeof useAsyncJob<void, GenerateGeoContentResult>>['job'];
  jobQuery: ReturnType<typeof useAsyncJob<void, GenerateGeoContentResult>>['jobQuery'];
  progress: number;
  enqueueError: Error | null;
  startGeneration: () => void;
  resetGeneration: () => void;
  cancelGeneration: () => Promise<void>;
  clearResult: () => void;
  setResult: (result: GenerateGeoContentResult | null) => void;
};

const GeoContentJobContext = createContext<GeoContentJobContextValue | null>(null);

export function GeoContentJobProvider({ children }: { children: ReactNode }) {
  const { targetUrl } = useWorkspaceTarget();
  const [result, setResultState] = useState<GenerateGeoContentResult | null>(() => readStoredResult());
  const [resultError, setResultError] = useState<string | null>(null);
  const [failedError, setFailedError] = useState<string | null>(null);

  const applyResult = useCallback((next: GenerateGeoContentResult | null) => {
    setResultState(next);
    writeStoredResult(next);
    if (next) setResultError(null);
  }, []);

  const {
    mutate,
    reset,
    cancelJob,
    enqueue,
    isRunning,
    isInterrupted,
    jobId,
    job,
    jobQuery,
    progress,
  } = useAsyncJob<void, GenerateGeoContentResult>({
    queryKeyPrefix: 'geo-content',
    pollIntervalMs: 1500,
    persistKey: JOB_STORAGE_KEY,
    background: BACKGROUND_JOB_UI.content,
    clearJobOnComplete: false,
    clearJobOnFailed: true,
    mutationFn: async () => {
      const url = targetUrl.trim();
      if (!url) throw new Error('Enter your website in the bar above');
      return api.post<{ jobId: string }>('/api/geo-content', { url });
    },
    onCompleted: (next) => {
      setFailedError(null);
      if (next) applyResult(next);
    },
    onFailed: (error) => {
      if (error) setFailedError(error);
    },
  });

  /** Resume result when returning to the page while a stored job already finished. */
  useEffect(() => {
    if (!jobId) return;
    if (job?.status !== 'completed') return;
    if (job.result) {
      applyResult(job.result);
      return;
    }
    if (!jobQuery.isPending && !jobQuery.isFetching) {
      setResultError(
        'Generation finished but no ideas were returned. If you use BullMQ, run `npm run worker` in another terminal.',
      );
    }
  }, [job, jobId, jobQuery.isPending, jobQuery.isFetching, applyResult]);

  const startGeneration = useCallback(() => {
    applyResult(null);
    setResultError(null);
    setFailedError(null);
    reset();
    mutate();
  }, [applyResult, reset, mutate]);

  const resetGeneration = useCallback(() => {
    applyResult(null);
    setResultError(null);
    setFailedError(null);
    reset();
  }, [applyResult, reset]);

  const cancelGeneration = useCallback(async () => {
    await cancelJob();
    setFailedError(null);
    setResultError(null);
    reset();
  }, [cancelJob, reset]);

  const clearResult = useCallback(() => {
    applyResult(null);
    setResultError(null);
  }, [applyResult]);

  const setResult = useCallback(
    (next: GenerateGeoContentResult | null) => {
      applyResult(next);
    },
    [applyResult],
  );

  const value = useMemo(
    () => ({
      result,
      resultError,
      failedError,
      isInterrupted: isInterrupted || isInterruptedJobError(failedError ?? undefined),
      isRunning,
      jobId,
      job,
      jobQuery,
      progress,
      enqueueError: enqueue.error ?? null,
      startGeneration,
      resetGeneration,
      cancelGeneration,
      clearResult,
      setResult,
    }),
    [
      result,
      resultError,
      failedError,
      isInterrupted,
      isRunning,
      jobId,
      job,
      jobQuery,
      progress,
      enqueue.error,
      startGeneration,
      resetGeneration,
      cancelGeneration,
      clearResult,
      setResult,
    ],
  );

  return <GeoContentJobContext.Provider value={value}>{children}</GeoContentJobContext.Provider>;
}

export function useGeoContentJob(): GeoContentJobContextValue {
  const ctx = useContext(GeoContentJobContext);
  if (!ctx) {
    throw new Error('useGeoContentJob must be used within GeoContentJobProvider');
  }
  return ctx;
}

export function useGeoContentJobOptional(): GeoContentJobContextValue | null {
  return useContext(GeoContentJobContext);
}
