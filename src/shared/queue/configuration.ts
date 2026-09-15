export function assertQueueConfiguration(input: {
  env: 'development' | 'production' | 'test';
  driver: 'memory' | 'bullmq';
  redisUrl?: string;
}): void {
  if (input.env === 'production' && input.driver !== 'bullmq') {
    throw new Error('Production requires QUEUE_DRIVER=bullmq; the in-memory queue can lose accepted jobs.');
  }
  if (input.driver === 'bullmq' && !input.redisUrl) {
    throw new Error('QUEUE_DRIVER=bullmq requires REDIS_URL.');
  }
}
