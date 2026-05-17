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
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { config } from '@shared/config';
import { queueLogger } from '@shared/logger';
import type { JobContext, JobHandler, Queue, QueueJob } from '../types';

const QUEUE_NAME = 'geo-jobs';

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

        await prisma.job.update({
          where: { id: row.id },
          data: { status: 'running', startedAt: new Date() },
        });

        const log = queueLogger.child({ jobId: row.id, jobType: row.type });
        const payload = parseJson(row.payload, null);
        const ctx: JobContext = {
          job: {
            id: row.id,
            type: row.type,
            payload,
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
}
