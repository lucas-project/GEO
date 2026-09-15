import { describe, expect, it } from 'vitest';
import { assertQueueConfiguration } from './configuration';

describe('assertQueueConfiguration', () => {
  it('rejects the volatile queue in production', () => {
    expect(() => assertQueueConfiguration({ env: 'production', driver: 'memory' })).toThrow(/QUEUE_DRIVER=bullmq/);
  });

  it('allows the development queue and a configured durable queue', () => {
    expect(() => assertQueueConfiguration({ env: 'development', driver: 'memory' })).not.toThrow();
    expect(() => assertQueueConfiguration({ env: 'production', driver: 'bullmq', redisUrl: 'redis://valkey:6379' })).not.toThrow();
  });
});
