'use client';

import { useEffect, useRef, useState } from 'react';

/** Format milliseconds as m:ss or Ns. */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${totalSec}s`;
}

export interface UseJobTimingOptions {
  /** Initial total estimate before progress is meaningful (e.g. question count × avg duration). */
  seedTotalMs?: number;
  /** Progress % at which ETA switches from seed to linear extrapolation. */
  minProgressForEta?: number;
}

export function useJobTiming(
  active: boolean,
  progress: number,
  options?: UseJobTimingOptions,
): {
  elapsedMs: number;
  elapsedLabel: string;
  remainingLabel: string | null;
  isEstimating: boolean;
} {
  const startedAtRef = useRef<number | null>(null);
  const [, tick] = useState(0);
  const minProgress = options?.minProgressForEta ?? 5;

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || startedAtRef.current === null) {
    return { elapsedMs: 0, elapsedLabel: '0s', remainingLabel: null, isEstimating: false };
  }

  const elapsedMs = Date.now() - startedAtRef.current;
  const elapsedLabel = formatDurationMs(elapsedMs);

  let remainingMs: number | null = null;
  let isEstimating = false;

  if (progress >= minProgress) {
    remainingMs = Math.max(0, (elapsedMs / progress) * (100 - progress));
  } else if (options?.seedTotalMs && options.seedTotalMs > 0) {
    remainingMs = Math.max(0, options.seedTotalMs - elapsedMs);
    isEstimating = true;
  }

  return {
    elapsedMs,
    elapsedLabel,
    remainingLabel: remainingMs != null ? formatDurationMs(remainingMs) : null,
    isEstimating,
  };
}
