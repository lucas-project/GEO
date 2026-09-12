'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { isTerminalJobStatus, type PolledJob } from '@/lib/jobs';
import { formatDurationMs } from '@/hooks/use-job-timing';
import {
  BACKGROUND_JOBS_CHANGED_EVENT,
  clearPersistedJob,
  listPersistedJobKeys,
  notifyBackgroundJobCompleted,
  resolveBackgroundJobUi,
  resolveViewHref,
  shouldClearPersistedJob,
} from '@/lib/background-job-persist';
import {
  readBackgroundJobMeta,
  useBackgroundJobsApi,
} from '@/features/workspace/background-jobs-context';

const POLL_MS = 1500;

/** Polls persisted job ids globally so sidebar % and floating panels work on any page. */
export function BackgroundJobPoller() {
  const registry = useBackgroundJobsApi();
  const queryClient = useQueryClient();
  const [persistKeys, setPersistKeys] = useState<string[]>([]);
  const startedAtRef = useRef<Record<string, number>>({});
  const registeredRef = useRef<Set<string>>(new Set());
  const completedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const rescan = () => setPersistKeys(listPersistedJobKeys());
    rescan();
    window.addEventListener(BACKGROUND_JOBS_CHANGED_EVENT, rescan);
    window.addEventListener('storage', rescan);
    const intervalId = setInterval(rescan, 3000);
    return () => {
      window.removeEventListener(BACKGROUND_JOBS_CHANGED_EVENT, rescan);
      window.removeEventListener('storage', rescan);
      clearInterval(intervalId);
    };
  }, []);

  const queries = useQueries({
    queries: persistKeys.map((persistKey) => ({
      queryKey: ['bg-persisted-job', persistKey] as const,
      queryFn: async (): Promise<{
        persistKey: string;
        jobId: string;
        job: PolledJob;
      } | null> => {
        const jobId = localStorage.getItem(persistKey);
        if (!jobId) return null;
        const { job } = await api.get<{ job: PolledJob }>(`/api/jobs/${jobId}`);
        return { persistKey, jobId, job };
      },
      enabled: Boolean(typeof window !== 'undefined' && localStorage.getItem(persistKey)),
      retry: (failureCount: number, error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return false;
        return failureCount < 2;
      },
      refetchInterval: (query: { state: { data?: { job: PolledJob } | null } }) => {
        const job = query.state.data?.job;
        const status = job?.status;
        if (status === 'completed' && job?.result == null) return Math.min(500, POLL_MS);
        return isTerminalJobStatus(status) ? false : POLL_MS;
      },
      refetchIntervalInBackground: true,
    })),
  });

  useEffect(() => {
    if (!registry) return;

    const activeIds = new Set<string>();

    for (let i = 0; i < persistKeys.length; i++) {
      const persistKey = persistKeys[i]!;
      const query = queries[i];
      if (!query) continue;

      if (query.error instanceof ApiError && query.error.status === 404) {
        registry.unregister(persistKey);
        registeredRef.current.delete(persistKey);
        delete startedAtRef.current[persistKey];
        clearPersistedJob(persistKey);
        continue;
      }

      const data = query.data;
      const storedJobId =
        typeof window !== 'undefined' ? localStorage.getItem(persistKey) : null;

      if (!data) {
        if (storedJobId) activeIds.add(persistKey);
        continue;
      }

      const { jobId, job } = data;
      const ui = resolveBackgroundJobUi(persistKey);
      if (!ui) continue;

      if (isTerminalJobStatus(job.status)) {
        if (job.status === 'completed' && job.result == null) {
          activeIds.add(persistKey);
          continue;
        }

        const completionKey = `${persistKey}:${jobId}:${job.status}`;
        if (job.status === 'completed' && job.result != null && !completedRef.current.has(completionKey)) {
          completedRef.current.add(completionKey);
          notifyBackgroundJobCompleted({ persistKey, jobId, result: job.result });
        }

        registry.unregister(persistKey);
        registeredRef.current.delete(persistKey);
        delete startedAtRef.current[persistKey];

        if (shouldClearPersistedJob(ui, job.status)) {
          clearPersistedJob(persistKey);
        }
        continue;
      }

      activeIds.add(persistKey);

      if (!startedAtRef.current[persistKey]) {
        startedAtRef.current[persistKey] = Date.now();
      }

      const meta = ui.metaStorageKey
        ? readBackgroundJobMeta<Record<string, unknown>>(ui.metaStorageKey)
        : null;
      const etaUnits =
        typeof meta?.questionCount === 'number' ? meta.questionCount : (ui.etaUnits ?? 1);
      const seedMs = 60_000 + Math.max(1, etaUnits) * 45_000;
      const elapsed = Date.now() - startedAtRef.current[persistKey]!;
      const progress = job.progress ?? 0;
      const remainingMs =
        progress >= 5
          ? Math.max(0, (elapsed / progress) * (100 - progress))
          : Math.max(0, seedMs - elapsed);

      registry.register(
        {
          id: persistKey,
          label: ui.label,
          statusMessage: job.statusMessage,
          progress,
          etaLabel: formatDurationMs(remainingMs),
          viewHref: resolveViewHref(ui, meta),
          viewLabel: ui.viewLabel,
          hideOnPathPrefix: ui.hideOnPathPrefix,
        },
        async () => {
          try {
            await api.post(`/api/jobs/${jobId}/cancel`, {});
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) throw err;
          }
          clearPersistedJob(persistKey);
          void queryClient.invalidateQueries({ queryKey: ['bg-persisted-job', persistKey] });
        },
      );
      registeredRef.current.add(persistKey);
    }

    for (const id of registeredRef.current) {
      if (!activeIds.has(id)) {
        registry.unregister(id);
        registeredRef.current.delete(id);
      }
    }
  }, [queries, persistKeys, registry, queryClient]);

  return null;
}
