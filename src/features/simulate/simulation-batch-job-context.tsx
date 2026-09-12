'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAsyncJob } from '@/hooks/use-async-job';
import { writeBackgroundJobMeta } from '@/features/workspace/background-jobs-context';
import { BACKGROUND_JOB_KEYS, BACKGROUND_JOB_META_KEYS } from '@/lib/background-job-keys';
import { BACKGROUND_JOB_UI } from '@/lib/background-job-ui';
import { useBackgroundJobProgress } from '@/hooks/use-background-job-progress';
import type { GeoAuditResult } from '@modules/geo-audit';
import type { VisibilityCheckSummary } from '@/components/geo/visibility-check-results';

export interface SimulationBatchPromptInput {
  text: string;
  type?: 'brand' | 'discovery';
}

export interface SimulationBatchPayload {
  prompts: SimulationBatchPromptInput[];
  targetBrand?: string;
  targetUrl?: string;
  contextAuditId?: string;
  auditId: string;
}

export interface SimulationSinglePayload {
  prompt: string;
  targetBrand?: string;
  targetUrl?: string;
  contextAuditId?: string;
}

interface BatchJobResult {
  promptsTested?: number;
  promptsCiting?: number;
  checkedAt?: string;
}

interface SingleJobResult {
  runId?: string;
}

interface StoredBatchMeta {
  auditId: string;
  questionCount: number;
}

function readMeta(): StoredBatchMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BACKGROUND_JOB_META_KEYS.simBatch);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBatchMeta;
    return parsed.auditId ? parsed : null;
  } catch {
    return null;
  }
}

export interface BatchCompleteSummary {
  promptsTested: number;
  promptsCiting: number;
  auditId: string;
}

type SimulationBatchJobContextValue = {
  isRunning: boolean;
  jobId: string | null;
  job: ReturnType<typeof useAsyncJob<SimulationBatchPayload, BatchJobResult>>['job'];
  progress: number;
  etaLabel: string | null;
  meta: StoredBatchMeta | null;
  completeSummary: BatchCompleteSummary | null;
  visibilityOverride: VisibilityCheckSummary | null;
  clearCompleteSummary: () => void;
  clearVisibilityOverride: () => void;
  setVisibilityOverride: (check: VisibilityCheckSummary | null) => void;
  startBatch: (payload: SimulationBatchPayload) => void;
  cancelBatch: () => Promise<void>;
  isSingleRunning: boolean;
  singleJobId: string | null;
  singleJob: ReturnType<typeof useAsyncJob<SimulationSinglePayload, SingleJobResult>>['job'];
  singleProgress: number;
  singleRunId: string | null;
  setSingleRunId: (runId: string | null) => void;
  startSingle: (payload: SimulationSinglePayload) => void;
  cancelSingle: () => Promise<void>;
};

const SimulationBatchJobContext = createContext<SimulationBatchJobContextValue | null>(null);

export function SimulationBatchJobProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState<StoredBatchMeta | null>(() => readMeta());
  const [completeSummary, setCompleteSummary] = useState<BatchCompleteSummary | null>(null);
  const [visibilityOverride, setVisibilityOverride] = useState<VisibilityCheckSummary | null>(
    null,
  );
  const [singleRunId, setSingleRunId] = useState<string | null>(null);
  const batchHandledRef = useRef<string | null>(null);

  const finishBatch = useCallback(
    async (result: BatchJobResult, auditId: string) => {
      setCompleteSummary({
        promptsTested: result.promptsTested ?? 0,
        promptsCiting: result.promptsCiting ?? 0,
        auditId,
      });
      try {
        const { audit } = await api.get<{ audit: GeoAuditResult }>(`/api/geo-audit/${auditId}`);
        const check = audit.scoringMeta?.simulationVisibilityCheck ?? null;
        if (check) setVisibilityOverride(check);
        queryClient.setQueryData(['sim-audit-suggestions', auditId], { audit });
      } catch {
        void queryClient.invalidateQueries({ queryKey: ['sim-audit-suggestions', auditId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['geo-audit', auditId] });
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.simBatch, null);
      setMeta(null);
    },
    [queryClient],
  );

  const {
    mutate,
    cancelJob,
    isRunning,
    jobId,
    job,
    progress: hookProgress,
  } = useAsyncJob<SimulationBatchPayload, BatchJobResult>({
    queryKeyPrefix: 'sim-batch-job',
    pollIntervalMs: 1500,
    persistKey: BACKGROUND_JOB_KEYS.simBatch,
    background: {
      ...BACKGROUND_JOB_UI.simBatch,
      metaStorageKey: BACKGROUND_JOB_META_KEYS.simBatch,
    },
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (payload) => {
      const nextMeta = { auditId: payload.auditId, questionCount: payload.prompts.length };
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.simBatch, nextMeta);
      setMeta(nextMeta);
      setCompleteSummary(null);
      batchHandledRef.current = null;
      return api.post<{ jobId: string }>('/api/simulate-ai-search/batch', payload);
    },
    onCompleted: async (result) => {
      const stored = readMeta();
      const auditId = stored?.auditId ?? meta?.auditId;
      if (result && auditId && jobId) {
        const key = `${jobId}:completed:${auditId}`;
        if (batchHandledRef.current === key) return;
        batchHandledRef.current = key;
        await finishBatch(result, auditId);
      } else {
        writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.simBatch, null);
        setMeta(null);
      }
    },
    onFailed: () => {
      writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.simBatch, null);
      setMeta(null);
    },
  });

  useEffect(() => {
    batchHandledRef.current = null;
  }, [jobId]);

  useEffect(() => {
    if (!jobId || job?.status !== 'completed' || job.result == null) return;
    const auditId = readMeta()?.auditId ?? meta?.auditId;
    if (!auditId) return;
    const key = `${jobId}:completed:${auditId}`;
    if (batchHandledRef.current === key) return;
    batchHandledRef.current = key;
    void finishBatch(job.result, auditId);
  }, [job, jobId, meta?.auditId, finishBatch]);

  const {
    mutate: mutateSingle,
    cancelJob: cancelSingleJob,
    isRunning: isSingleRunning,
    jobId: singleJobId,
    job: singleJob,
    progress: singleHookProgress,
  } = useAsyncJob<SimulationSinglePayload, SingleJobResult>({
    queryKeyPrefix: 'sim-job',
    pollIntervalMs: 1200,
    persistKey: BACKGROUND_JOB_KEYS.simSingle,
    background: BACKGROUND_JOB_UI.simSingle,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (payload) =>
      api.post<{ jobId: string }>('/api/simulate-ai-search', payload),
    onCompleted: (result) => {
      if (result?.runId) setSingleRunId(result.runId);
    },
  });

  useEffect(() => {
    if (!singleJobId || singleJob?.status !== 'completed') return;
    if (singleJob.result?.runId) setSingleRunId(singleJob.result.runId);
  }, [singleJob, singleJobId]);

  const { progress: bgProgress, etaLabel } = useBackgroundJobProgress(BACKGROUND_JOB_KEYS.simBatch);
  const { progress: singleBgProgress } = useBackgroundJobProgress(BACKGROUND_JOB_KEYS.simSingle);
  const progress = bgProgress ?? hookProgress;
  const singleProgress = singleBgProgress ?? singleHookProgress;

  const startBatch = useCallback(
    (payload: SimulationBatchPayload) => {
      mutate(payload);
    },
    [mutate],
  );

  const cancelBatch = useCallback(async () => {
    await cancelJob();
    writeBackgroundJobMeta(BACKGROUND_JOB_META_KEYS.simBatch, null);
    setMeta(null);
  }, [cancelJob]);

  const startSingle = useCallback(
    (payload: SimulationSinglePayload) => {
      setSingleRunId(null);
      mutateSingle(payload);
    },
    [mutateSingle],
  );

  const cancelSingle = useCallback(async () => {
    await cancelSingleJob();
  }, [cancelSingleJob]);

  const value = useMemo(
    (): SimulationBatchJobContextValue => ({
      isRunning,
      jobId,
      job,
      progress,
      etaLabel,
      meta,
      completeSummary,
      visibilityOverride,
      clearCompleteSummary: () => setCompleteSummary(null),
      clearVisibilityOverride: () => setVisibilityOverride(null),
      setVisibilityOverride,
      startBatch,
      cancelBatch,
      isSingleRunning,
      singleJobId,
      singleJob,
      singleProgress,
      singleRunId,
      setSingleRunId,
      startSingle,
      cancelSingle,
    }),
    [
      isRunning,
      jobId,
      job,
      progress,
      etaLabel,
      meta,
      completeSummary,
      visibilityOverride,
      startBatch,
      cancelBatch,
      isSingleRunning,
      singleJobId,
      singleJob,
      singleProgress,
      singleRunId,
      startSingle,
      cancelSingle,
    ],
  );

  return (
    <SimulationBatchJobContext.Provider value={value}>{children}</SimulationBatchJobContext.Provider>
  );
}

export function useSimulationBatchJob(): SimulationBatchJobContextValue {
  const ctx = useContext(SimulationBatchJobContext);
  if (!ctx) {
    throw new Error('useSimulationBatchJob must be used within SimulationBatchJobProvider');
  }
  return ctx;
}
