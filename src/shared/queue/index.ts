/**
 * Queue singleton — selects adapter based on config.
 *
 * Cached on globalThis so the same instance is shared between Next.js
 * route handlers (which only enqueue) and the worker process (which both
 * enqueues and processes).
 */

import { config } from '@shared/config';
import { queueLogger } from '@shared/logger';
import { InMemoryQueue } from './adapters/in-memory';
import { assertQueueConfiguration } from './configuration';
import type { Queue } from './types';

declare global {
  var __geoQueue: Queue | undefined;
}

function createQueue(): Queue {
  if (!config.isBuild) {
    assertQueueConfiguration({
      env: config.env,
      driver: config.queue.driver,
      redisUrl: config.queue.redisUrl,
    });
  }
  if (config.queue.driver === 'bullmq' && config.queue.redisUrl) {
    try {
      // Runtime-only load so webpack does not bundle bullmq/ioredis into instrumentation.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BullmqQueue } = require('./adapters/bullmq') as typeof import('./adapters/bullmq');
      return new BullmqQueue(config.queue.redisUrl);
    } catch (err) {
      if (config.env === 'production') throw err;
      queueLogger.warn({ err }, 'BullMQ init failed; falling back to in-memory queue');
    }
  }
  return new InMemoryQueue();
}

export const queue: Queue = globalThis.__geoQueue ?? createQueue();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoQueue = queue;
}
