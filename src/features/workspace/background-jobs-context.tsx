'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BackgroundJobPoller } from '@/features/workspace/background-job-poller';

/** Display fields only — cancel handlers live in a ref map. */
export interface RegisteredBackgroundJob {
  id: string;
  label: string;
  statusMessage?: string;
  progress: number;
  etaLabel?: string | null;
  viewHref?: string;
  viewLabel?: string;
  hideOnPathPrefix?: string;
}

/** Stable API — identity never changes when the jobs list updates. */
type BackgroundJobsApi = {
  register: (job: RegisteredBackgroundJob, onCancel?: () => void | Promise<void>) => void;
  unregister: (id: string) => void;
  cancel: (id: string) => void;
};

const BackgroundJobsApiContext = createContext<BackgroundJobsApi | null>(null);
const BackgroundJobsListContext = createContext<RegisteredBackgroundJob[]>([]);

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const [jobsById, setJobsById] = useState<Record<string, RegisteredBackgroundJob>>({});
  const cancelByIdRef = useRef<Record<string, (() => void | Promise<void>) | undefined>>({});

  const register = useCallback(
    (job: RegisteredBackgroundJob, onCancel?: () => void | Promise<void>) => {
      if (onCancel) cancelByIdRef.current[job.id] = onCancel;
      else delete cancelByIdRef.current[job.id];

      setJobsById((prev) => {
        const existing = prev[job.id];
        if (
          existing &&
          existing.label === job.label &&
          existing.statusMessage === job.statusMessage &&
          existing.progress === job.progress &&
          existing.etaLabel === job.etaLabel &&
          existing.viewHref === job.viewHref &&
          existing.viewLabel === job.viewLabel &&
          existing.hideOnPathPrefix === job.hideOnPathPrefix
        ) {
          return prev;
        }
        return { ...prev, [job.id]: job };
      });
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    delete cancelByIdRef.current[id];
    setJobsById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const cancel = useCallback((id: string) => {
    void cancelByIdRef.current[id]?.();
  }, []);

  const api = useMemo(
    (): BackgroundJobsApi => ({ register, unregister, cancel }),
    [register, unregister, cancel],
  );

  const jobs = useMemo(() => Object.values(jobsById), [jobsById]);

  return (
    <BackgroundJobsApiContext.Provider value={api}>
      <BackgroundJobsListContext.Provider value={jobs}>
        {children}
        <BackgroundJobPoller />
      </BackgroundJobsListContext.Provider>
    </BackgroundJobsApiContext.Provider>
  );
}

export function useBackgroundJobsApi(): BackgroundJobsApi | null {
  return useContext(BackgroundJobsApiContext);
}

export function useBackgroundJobs(): Array<
  RegisteredBackgroundJob & { onCancel?: () => void | Promise<void> }
> {
  const jobs = useContext(BackgroundJobsListContext);
  const api = useContext(BackgroundJobsApiContext);
  if (!api) return [];
  return jobs.map((job) => ({
    ...job,
    onCancel: () => api.cancel(job.id),
  }));
}

/** Persist small job metadata (view link, counts) alongside localStorage job id. */
export function readBackgroundJobMeta<T extends Record<string, unknown>>(
  storageKey: string,
): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeBackgroundJobMeta(
  storageKey: string,
  meta: Record<string, unknown> | null,
): void {
  if (typeof window === 'undefined') return;
  if (!meta) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify(meta));
}
