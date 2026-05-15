/**
 * Client-side job polling helpers (mirrors @shared/queue/types).
 */

import type { JobStatus } from '@shared/queue/types';

export type { JobStatus };

export interface PolledJob<TResult = unknown> {
  id?: string;
  type?: string;
  status: JobStatus;
  progress: number;
  result?: TResult | null;
  error?: string;
}

export function isTerminalJobStatus(status: JobStatus | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
