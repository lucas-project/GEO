'use client';

import { useBackgroundJobs } from '@/features/workspace/background-jobs-context';

/** Live progress from the global background job poller (works off-page). */
export function useBackgroundJobProgress(persistKey: string | undefined): {
  progress: number | undefined;
  etaLabel: string | null;
  statusMessage: string | undefined;
} {
  const jobs = useBackgroundJobs();
  const job = persistKey ? jobs.find((entry) => entry.id === persistKey) : undefined;
  return {
    progress: job?.progress,
    etaLabel: job?.etaLabel ?? null,
    statusMessage: job?.statusMessage,
  };
}
