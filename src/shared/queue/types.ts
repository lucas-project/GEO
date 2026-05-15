/**
 * Queue contracts.
 *
 * Modules dispatch work via `queue.enqueue(jobType, payload)`. A worker
 * registers handlers via `queue.process(jobType, handler)`. The default
 * driver is in-memory (process-local). Swap to BullMQ by setting
 * QUEUE_DRIVER=bullmq + REDIS_URL.
 *
 * The interface is Temporal-compatible at the conceptual level — see
 * docs/orchestration.md (TODO) for the migration path.
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueJob<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  status: JobStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface JobContext<TPayload = unknown> {
  job: QueueJob<TPayload>;
  reportProgress: (progress: number) => Promise<void>;
  log: (message: string, extra?: Record<string, unknown>) => void;
}

export type JobHandler<TPayload = unknown, TResult = unknown> = (
  ctx: JobContext<TPayload>,
) => Promise<TResult>;

export interface Queue {
  enqueue<TPayload>(jobType: string, payload: TPayload): Promise<string>;
  process<TPayload, TResult>(jobType: string, handler: JobHandler<TPayload, TResult>): void;
  getJob(jobId: string): Promise<QueueJob | null>;
  cancel(jobId: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
