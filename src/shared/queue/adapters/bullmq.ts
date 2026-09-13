/**
 * BullMQ + Redis queue adapter.
 *
 * Prisma `Job` rows remain the source of truth for status polling (`GET /api/jobs/:id`).
 * Redis carries execution work; the worker process must set GEO_QUEUE_CONSUMER=true
 * (set automatically in workers/index.ts).
 */

import { Queue as BullQueue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { randomId } from '@shared/util/id';
import { createHash } from 'node:crypto';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { config } from '@shared/config';
import { queueLogger } from '@shared/logger';
import { reapOrphanedRunningJobs } from '../reap-orphaned-jobs';
import type { JobContext, JobHandler, Queue, QueueJob } from '../types';
import { executeWithBudget } from '../execution';

const QUEUE_NAME = 'geo-jobs';
const LEASE_MS = 5 * 60 * 1000;

export class BullmqQueue implements Queue {
  private handlers = new Map<string, JobHandler>();
  private connection: IORedis;
  private bullQueue: BullQueue;
  private worker: Worker | null = null;
  private workerConnection: IORedis | null = null;
  private running = false;

  constructor(redisUrl: string) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.bullQueue = new BullQueue(QUEUE_NAME, { connection: this.connection });
  }

  process<TPayload, TResult>(jobType: string, handler: JobHandler<TPayload, TResult>): void {
    this.handlers.set(jobType, handler as JobHandler);
    queueLogger.info({ jobType }, 'bullmq handler registered');
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
      if (existing.status === 'pending' && !(await this.bullQueue.getJob(id))) {
        await this.bullQueue.add(
          jobType,
          { prismaJobId: id, payload },
          { jobId: id, attempts: 1, removeOnComplete: { count: 500 }, removeOnFail: { count: 200 } },
        );
      }
      return existing.id;
    }
    await this.bullQueue.add(
      jobType,
      { prismaJobId: id, payload },
      {
        jobId: id,
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    );
    queueLogger.info({ jobId: id, jobType }, 'job enqueued (bullmq)');
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
    await prisma.job.updateMany({
      where: { id: jobId, status: { in: ['pending', 'running'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    const bullJob = await this.bullQueue.getJob(jobId);
    await bullJob?.remove().catch(() => {});
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (process.env.GEO_QUEUE_CONSUMER !== 'true') {
      queueLogger.info('BullMQ: skipping worker start (GEO_QUEUE_CONSUMER is not true)');
      return;
    }
    this.running = true;
    await reapOrphanedRunningJobs();
    this.workerConnection = this.connection.duplicate();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        let prismaJobId = (job.data as { prismaJobId?: string }).prismaJobId;
        let row = prismaJobId
          ? await prisma.job.findUnique({ where: { id: prismaJobId } })
          : null;
        if ((!row || row.status === 'cancelled') && job.name === 'monitoring.sweep') {
          prismaJobId = randomId();
          row = await prisma.job.create({
            data: {
              id: prismaJobId,
              type: 'monitoring.sweep',
              status: 'pending',
              payload: stringifyJson({}),
            },
          });
        }
        if (!row || row.status === 'cancelled') return;
        const handler = this.handlers.get(row.type);
        if (!handler) {
          queueLogger.warn({ jobType: row.type }, 'no handler for job type');
          return;
        }

        const leaseToken = randomId();
        const now = new Date();
        const claimed = await prisma.$executeRaw`
          UPDATE "Job"
          SET "status" = 'running', "startedAt" = ${now},
              "heartbeatAt" = ${now}, "leaseExpiresAt" = ${new Date(now.getTime() + LEASE_MS)},
              "leaseToken" = ${leaseToken}, "attempt" = COALESCE("attempt", 0) + 1
          WHERE "id" = ${row.id} AND "status" = 'pending'
        `;
        if (claimed !== 1) return;

        const log = queueLogger.child({ jobId: row.id, jobType: row.type });
        const startedAtMs = Date.now();
        const payload = parseJson(row.payload, null);
        const controller = new AbortController();
        const runtimeTimer = setTimeout(() => controller.abort(), config.queue.maxRuntimeMs);
        const cancellationPoll = setInterval(() => {
          void prisma.job
            .findUnique({ where: { id: row.id }, select: { status: true } })
            .then((current) => {
              if (current?.status === 'cancelled') controller.abort();
            })
            .catch(() => {});
        }, 500);
        const ctx: JobContext = {
          job: {
            id: row.id,
            type: row.type,
            payload,
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
                "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: row.attempt + 1 })},
                "leaseToken" = NULL, "leaseExpiresAt" = NULL
            WHERE "id" = ${row.id} AND "status" = 'running' AND "leaseToken" = ${leaseToken}
          `;
          if (completed !== 1) {
            log.warn('job completion ignored because lease was lost or job was cancelled');
            clearInterval(cancellationPoll);
            clearTimeout(runtimeTimer);
            return;
          }
          log.info('job completed');
          clearInterval(cancellationPoll);
          clearTimeout(runtimeTimer);
        } catch (err) {
          clearInterval(cancellationPoll);
          const current = await prisma.job.findUnique({
            where: { id: row.id },
            select: { status: true },
          });
          if (current?.status === 'cancelled') {
            log.info('job cancelled');
            await prisma.$executeRaw`
              UPDATE "Job" SET "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: row.attempt + 1 })}
              WHERE "id" = ${row.id}
            `;
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          log.error({ err: message, stack }, 'job failed');
          await prisma.$executeRaw`
            UPDATE "Job"
            SET "status" = 'failed', "error" = ${message}, "finishedAt" = ${new Date()},
                "usage" = ${stringifyJson({ ...ctx.budget?.snapshot(), durationMs: Date.now() - startedAtMs, attempt: row.attempt + 1 })},
                "leaseToken" = NULL, "leaseExpiresAt" = NULL
            WHERE "id" = ${row.id} AND "status" = 'running' AND "leaseToken" = ${leaseToken}
          `;
          throw err;
        }
      },
      { connection: this.workerConnection!, concurrency: 2 },
    );
    queueLogger.info('BullMQ worker started');

    if (this.handlers.has('monitoring.sweep')) {
      await this.bullQueue.add(
        'monitoring.sweep',
        { prismaJobId: 'repeat-monitor-sweep', payload: {} },
        {
          jobId: 'repeat-monitoring-sweep',
          repeat: { pattern: config.monitoring.sweepCronPattern },
          removeOnComplete: { count: 20 },
          removeOnFail: { count: 10 },
        },
      );
      queueLogger.info(
        { pattern: config.monitoring.sweepCronPattern },
        'BullMQ repeatable monitoring.sweep registered',
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.workerConnection) {
      await this.workerConnection.quit();
      this.workerConnection = null;
    }
    queueLogger.info('BullMQ worker stopped');
  }

  ensureActive(): void {
    // BullMQ worker is managed by the separate worker process.
  }
}
