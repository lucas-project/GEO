'use client';

import { useEffect, useRef } from 'react';
import {
  BACKGROUND_JOB_COMPLETED_EVENT,
  takePendingJobCompletion,
  type BackgroundJobCompletedDetail,
} from '@/lib/background-job-persist';

/** Resume UI when a persisted job completed while this component was unmounted. */
export function usePersistedJobCompletion<T>(
  persistKey: string | undefined,
  onCompleted: (result: T, jobId?: string) => void,
): void {
  const handlerRef = useRef(onCompleted);
  handlerRef.current = onCompleted;

  useEffect(() => {
    if (!persistKey) return;

    const pending = takePendingJobCompletion<T>(persistKey);
    if (pending) handlerRef.current(pending.result, pending.jobId);

    const onEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<BackgroundJobCompletedDetail>).detail;
      if (detail?.persistKey !== persistKey) return;
      if (detail.result != null) handlerRef.current(detail.result as T, detail.jobId);
    };

    window.addEventListener(BACKGROUND_JOB_COMPLETED_EVENT, onEvent);
    return () => window.removeEventListener(BACKGROUND_JOB_COMPLETED_EVENT, onEvent);
  }, [persistKey]);
}
