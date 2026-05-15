/**
 * Worker process entry — registers all job handlers and starts the queue.
 *
 * Run with: `npm run worker`
 *
 * In dev, the in-memory queue driver also runs handlers inside the Next.js
 * server, so this process is optional. In production / with BullMQ, this is
 * the dedicated worker.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { queue } from '@shared/queue';
import { logger } from '@shared/logger';
import { registerAllQueueHandlers } from '@shared/queue/register-handlers';

async function main() {
  logger.info('starting GEO worker');

  registerAllQueueHandlers();

  await queue.start();
  logger.info('worker ready');

  process.on('SIGINT', async () => {
    logger.info('shutting down worker');
    await queue.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'worker crashed');
  process.exit(1);
});
