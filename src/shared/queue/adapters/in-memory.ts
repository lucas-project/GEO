/**
 * In-process queue with database-backed Job persistence.
 *
 * Even though execution is in-process, we persist Job records to Prisma so
 * that the same job IDs are visible across the Next.js server and the
 * standalone worker process. Workers poll for pending jobs.
 */

import { randomId } from '@shared/util/id';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { config } from '@shared/config';
import { queueLogger } from '@shared/logger';
import { reapOrphanedRunningJobs } from '../reap-orphaned-jobs';
import {
  canRunAlongsideRunning,
  compareJobsByPriority,
} from '../job-priority';
import type { JobContext, JobHandler, Queue, QueueJob } from '../types';

const POLL_INTERVAL_MS = 1000;
const STALE_POLL_MS = 5000;
const PENDING_FETCH_LIMIT = 40;

type JobRow = {
  id: string;
  type: string;
  payload: string;
  createdAt: Date;
};

export class InMemoryQueue implements Queue {
  private handlers = new Map<string, JobHandler>();
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private monitorSchedulerTimer: NodeJS.Timeout | null = null;
  private lastTickAt = 0;
  private runningJobIds = new Set<string>();
  private runningJobTypes = new Set<string>();

  process<TPayload, TResult>(jobType: string, handler: JobHandler<TPayload, TResult>): void {
    this.handlers.set(jobType, handler as JobHandler);
    queueLogger.info({ jobType }, 'handler registered');
  }

  async enqueue<TPayload>(jobType: string, payload: TPayload): Promise<string> {
    const id = randomId();
    await prisma.job.create({
      data: {
        id,
        type: jobType,
        status: 'pending',
        payload: stringifyJson(payload),
      },
    });
    queueLogger.info({ jobId: id, jobType }, 'job enqueued');
    this.ensureActive();
    return id;
  }

  async getJob(jobId: string): Promise<QueueJob | null> {
    const row = await prisma.job.findUnique({ where: { id: jobId } });
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      payload: parseJson(row.payload, null),
      status: row.status as QueueJob['status'],
      progress: row.progress,
      statusMessage: row.statusMessage ?? undefined,
      result: row.result ? parseJson(row.result, null) : undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? undefined,
      finishedAt: row.finishedAt ?? undefined,
    };
  }

  async cancel(jobId: string): Promise<void> {
    await prisma.job.updateMany({
      where: { id: jobId, status: { in: ['pending', 'running'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
  }

  async start(): Promise<void> {
    const firstStart = !this.running;
    this.running = true;
    if (firstStart) {
      await reapOrphanedRunningJobs();
      queueLogger.info('queue worker starting (in-memory driver)');
    }
    this.ensureActive();
    if (firstStart) this.startMonitorScheduler();
  }

  ensureActive(): void {
    if (!this.running) return;
    const stale =
      this.lastTickAt > 0 && Date.now() - this.lastTickAt > STALE_POLL_MS;
    if (!this.pollTimer || stale) {
      if (stale) {
        queueLogger.warn('queue poll loop stale; restarting');
      }
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = null;
      this.scheduleNext();
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (this.monitorSchedulerTimer) clearInterval(this.monitorSchedulerTimer);
    this.monitorSchedulerTimer = null;
    queueLogger.info('queue worker stopped');
  }

  private startMonitorScheduler() {
    const ms = config.monitoring.inlineSchedulerMs;
    if (ms <= 0 || !this.handlers.has('monitoring.sweep')) return;
    queueLogger.info({ intervalMs: ms }, 'inline monitor scheduler started');
    this.monitorSchedulerTimer = setInterval(() => {
      void this.maybeEnqueueMonitoringSweep();
    }, ms);
  }

  private async maybeEnqueueMonitoringSweep() {
    const blocked = await prisma.job.count({
      where: {
        status: { in: ['pending', 'running'] },
        type: { notIn: ['monitoring.sweep', 'intelligence.ingest'] },
      },
    });
    if (blocked > 0) return;
    await this.enqueue('monitoring.sweep', {}).catch((err) => {
      queueLogger.warn({ err }, 'failed to enqueue monitoring.sweep');
    });
  }

  private scheduleNext() {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  private async tick() {
    this.lastTickAt = Date.now();
    try {
      await this.startEligibleJobs();
    } catch (err) {
      queueLogger.error({ err }, 'queue tick failed');
    }
    this.scheduleNext();
  }

  private maxConcurrentSlots(): number {
    return Math.max(1, config.queue.maxConcurrent ?? 1);
  }

  private async startEligibleJobs() {
    while (this.runningJobIds.size < this.maxConcurrentSlots()) {
      const row = await this.pickNextPendingJob();
      if (!row) break;
      this.runningJobIds.add(row.id);
      this.runningJobTypes.add(row.type);
      void this.runJob(row).finally(() => {
        this.runningJobIds.delete(row.id);
        this.runningJobTypes.delete(row.type);
      });
    }
  }

  private async pickNextPendingJob(): Promise<JobRow | null> {
    const handlerTypes = Array.from(this.handlers.keys());
    if (handlerTypes.length === 0) return null;

    const pending = await prisma.job.findMany({
      where: { status: 'pending', type: { in: handlerTypes } },
      orderBy: { createdAt: 'asc' },
      take: PENDING_FETCH_LIMIT,
      select: { id: true, type: true, payload: true, createdAt: true },
    });
    if (pending.length === 0) return null;

    const sorted = [...pending].sort(compareJobsByPriority);
    for (const row of sorted) {
      if (this.runningJobIds.has(row.id)) continue;
      if (!canRunAlongsideRunning(this.runningJobTypes, row.type)) continue;
      return row;
    }
    return null;
  }

  private async runJob(row: JobRow) {
    const handler = this.handlers.get(row.type);
    if (!handler) {
      queueLogger.error({ jobId: row.id, jobType: row.type }, 'no handler registered');
      await prisma.job.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          error: `No handler registered for job type "${row.type}"`,
          finishedAt: new Date(),
        },
      });
      return;
    }

    await prisma.job.update({
      where: { id: row.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const log = queueLogger.child({ jobId: row.id, jobType: row.type });
    const ctx: JobContext = {
      job: {
        id: row.id,
        type: row.type,
        payload: parseJson(row.payload, null),
        status: 'running',
        progress: 0,
        createdAt: row.createdAt,
      },
      reportProgress: async (progress: number, message?: string) => {
        await prisma.job.update({
          where: { id: row.id },
          data: {
            progress: Math.max(0, Math.min(100, Math.round(progress))),
            ...(message !== undefined ? { statusMessage: message } : {}),
          },
        });
      },
      log: (message, extra) => log.info(extra ?? {}, message),
    };

    try {
      const result = await handler(ctx);
      await prisma.job.update({
        where: { id: row.id },
        data: {
          status: 'completed',
          progress: 100,
          result: stringifyJson(result ?? null),
          finishedAt: new Date(),
        },
      });
      log.info('job completed');
    } catch (err) {
      const current = await prisma.job.findUnique({
        where: { id: row.id },
        select: { status: true },
      });
      if (current?.status === 'cancelled') {
        log.info('job cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      log.error({ err: message, stack }, 'job failed');
      await prisma.job.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          error: message,
          finishedAt: new Date(),
        },
      });
    }
  }
}
