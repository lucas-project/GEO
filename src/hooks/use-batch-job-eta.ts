'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDurationMs } from '@/hooks/use-job-timing';

const ETA_TICK_MS = 10_000;

/** Stable ETA for batch jobs — recomputed at most every 10 seconds. */
export function useBatchJobEta(
  active: boolean,
  progress: number,
  questionCount: number,
): { etaLabel: string | null } {
  const seedMs = 60_000 + Math.max(1, questionCount) * 45_000;
  const startedAtRef = useRef<number | null>(null);
  const [etaLabel, setEtaLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setEtaLabel(null);
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const compute = () => {
      const started = startedAtRef.current;
      if (started == null) return;
      const elapsed = Date.now() - started;
      const remainingMs =
        progress >= 5
          ? Math.max(0, (elapsed / progress) * (100 - progress))
          : Math.max(0, seedMs - elapsed);
      setEtaLabel(formatDurationMs(remainingMs));
    };

    compute();
    const id = setInterval(compute, ETA_TICK_MS);
    return () => clearInterval(id);
  }, [active, progress, questionCount, seedMs]);

  return { etaLabel };
}
