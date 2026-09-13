/**
 * In-process queue with database-backed Job persistence.
 *
 * Even though execution is in-process, we persist Job records to Prisma so
 * that the same job IDs are visible across the Next.js server and the
 * standalone worker process. Workers poll for pending jobs.
 */

import { randomId } from '@shared/util/id';
import { createHash } from 'node:crypto';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { config } from '@shared/config';
import { queueLogger } from '@shared/logger';
import { reapOrphanedRunningJobs } from '../reap-orphaned-jobs';
import {
  canRunAlongsideRunning,
  compareJobsByPriority,
} from '../job-priority';
import type { JobContext, JobHandler, Queue, QueueJob } from '../types';
import { executeWithBudget } from '../execution';

const POLL_INTERVAL_MS = 1000;
const STALE_POLL_MS = 5000;
const PENDING_FETCH_LIMIT = 40;
const LEASE_MS = 5 * 60 * 1000;

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
  private jobControllers = new Map<string, AbortController>();

  process<TPayload, TResult>(jobType: string, handler: JobHandler<TPayload, TResult>): void {
    this.handlers.set(jobType, handler as JobHandler);
    queueLogger.info({ jobType }, 'handler registered');
  }

  async enqueue<TPayload>(jobType: string, payload: TPayload, options?: { idempotencyKey?: string }): Promise<string> {
    const id = options?.idempotencyKey
      ? `idem-${createHash('sha256').update(`${jobType}:${options.idempotencyKey}`).digest('hex').slice(0, 32)}`
      : randomId();
    try {
      await prisma.job.create({
        data: {
          id,
          type: jobType,
          status: 'pending',
          payload: stringifyJson(payload),
        },
      });
      if (options?.idempotencyKey) {
        await prisma.$executeRaw`UPDATE "Job" SET "idempotencyKey" = ${options.idempotencyKey} WHERE "id" = ${id}`;
      }
    } catch (err) {
      if (!options?.idempotencyKey) throw err;
      const existing = await prisma.job.findUnique({ where: { id } });
      if (!existing) throw err;
      this.ensureActive();
      return existing.id;
    }
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
      usage: row.usage ? parseJson(row.usage, {}) : undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? undefined,
      finishedAt: row.finishedAt ?? undefined,
    };
  }

  async cancel(jobId: string): Promise<void> {
    this.jobControllers.get(jobId)?.abort();
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
      const leaseToken = await this.claimPendingJob(row.id);
      if (!leaseToken) continue;
      this.runningJobIds.add(row.id);
      this.runningJobTypes.add(row.type);
      void this.runJob(row, leaseToken).finally(() => {
        this.runningJobIds.delete(row.id);
        this.runningJobTypes.delete(row.type);
      });
    }
  }

  /** Atomically claim a pending row so a second worker cannot run it. */
  private async claimPendingJob(jobId: string): Promise<string | null> {
    const leaseToken = randomId();
    const now = new Date();
    const expires = new Date(now.getTime() + LEASE_MS);
    const claimed = await prisma.$executeRaw`
      UPDATE "Job"
      SET "status" = 'running', "startedAt" = ${now},
          "heartbeatAt" = ${now}, "leaseExpiresAt" = ${expires},
          "leaseToken" = ${leaseToken}, "attempt" = COALESCE("attempt", 0) + 1
      WHERE "id" = ${jobId} AND "status" = 'pending'
    `;
    return claimed === 1 ? leaseToken : null;
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

  private async runJob(row: JobRow, leaseToken: string) {
    const startedAtMs = Date.now();
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

    const log = queueLogger.child({ jobId: row.id, jobType: row.type });
    const controller = new AbortController();
    const runtimeTimer = setTimeout(() => controller.abort(), config.queue.maxRuntimeMs);
    this.jobControllers.set(row.id, controller);
    const ctx: JobContext = {
      job: {
        id: row.id,
        type: row.type,
        payload: parseJson(row.payload, null),
        status: 'running',
        progress: 0,
        createdAt: row.createdAt,
      },
      signal: controller.signal,
      reportProgress: async (progress: number, message?: string) => {
        if (controller.signal.aborted) throw new Error('job cancelled');
        const bounded = Math.max(0, Math.min(100, Math.round(progress)));
        await prisma.$executeRaw`
          UPDATE "Job"
          SET "progress" = ${bounded},
              "heartbeatAt" = ${new Date()},
              "leaseExpiresAt" = ${new Date(Date.now() + LEASE_MS)},
              "statusMessage" = COALESCE(${message ?? null}, "statusMessage")
          WHERE "id" = ${row.id} AND "status" = 'running' AND "leaseToken" = ${leaseToken}
        `;
      },
      log: (message, extra) => log.info(extra ?? {}, message),
    };

    try {
      const result = await executeWithBudget(ctx, handler, leaseToken);
      const completed = await prisma.$executeRaw`
        UPDATE "Job"
        SET "status" = 'completed', "progress" = 100,
            "result" = ${stringifyJson(result ?? null)}, "finishedAt" = ${new Date()},
            "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: 1 })},
            "leaseToken" = NULL, "leaseExpiresAt" = NULL
        WHERE "id" = ${row.id} AND "status" = 'running' AND "leaseToken" = ${leaseToken}
      `;
      if (completed !== 1) {
        log.warn('job completion ignored because lease was lost or job was cancelled');
        this.jobControllers.delete(row.id);
        clearTimeout(runtimeTimer);
        return;
      }
      log.info('job completed');
    } catch (err) {
      const current = await prisma.job.findUnique({
        where: { id: row.id },
        select: { status: true },
      });
      if (current?.status === 'cancelled') {
        log.info('job cancelled');
        await prisma.$executeRaw`
          UPDATE "Job" SET "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: 1 })}
          WHERE "id" = ${row.id}
        `;
        this.jobControllers.delete(row.id);
        clearTimeout(runtimeTimer);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      log.error({ err: message, stack }, 'job failed');
      await prisma.$executeRaw`
        UPDATE "Job"
        SET "status" = 'failed', "error" = ${message}, "finishedAt" = ${new Date()},
            "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: 1 })},
            "leaseToken" = NULL, "leaseExpiresAt" = NULL
        WHERE "id" = ${row.id} AND "status" = 'running' AND "leaseToken" = ${leaseToken}
      `;
    }
    this.jobControllers.delete(row.id);
    clearTimeout(runtimeTimer);
  }
}
