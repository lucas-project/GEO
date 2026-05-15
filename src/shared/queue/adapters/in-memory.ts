/**
 * In-process queue with database-backed Job persistence.
 *
 * Even though execution is in-process, we persist Job records to Prisma so
 * that the same job IDs are visible across the Next.js server and the
 * standalone worker process. Workers poll for pending jobs.
 */

import { randomId } from '@shared/util/id';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { queueLogger } from '@shared/logger';
import type { JobContext, JobHandler, Queue, QueueJob } from '../types';

const POLL_INTERVAL_MS = 1000;

export class InMemoryQueue implements Queue {
  private handlers = new Map<string, JobHandler>();
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;

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
    if (this.running) return;
    this.running = true;
    queueLogger.info('queue worker starting (in-memory driver)');
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    queueLogger.info('queue worker stopped');
  }

  private scheduleNext() {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  private async tick() {
    try {
      await this.processOnce();
    } catch (err) {
      queueLogger.error({ err }, 'queue tick failed');
    }
    this.scheduleNext();
  }

  private async processOnce() {
    const pending = await prisma.job.findMany({
      where: { status: 'pending', type: { in: Array.from(this.handlers.keys()) } },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
    if (pending.length === 0) return;
    const row = pending[0];
    const handler = this.handlers.get(row.type);
    if (!handler) return;

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
      reportProgress: async (progress: number) => {
        await prisma.job.update({
          where: { id: row.id },
          data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
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
