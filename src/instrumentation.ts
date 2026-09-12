/**
 * Next.js instrumentation — runs once when the server starts.
 *
 * We use this to register queue handlers and start the in-process worker so
 * single-terminal `npm run dev` actually processes jobs end-to-end. In
 * production with QUEUE_DRIVER=bullmq, you'd run the dedicated `workers/`
 * entry alongside the web server instead (and skip this auto-start).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ queue }, { logger }, { config }, { registerAllQueueHandlers }] = await Promise.all([
    import('@shared/queue'),
    import('@shared/logger'),
    import('@shared/config'),
    import('@shared/queue/register-handlers'),
  ]);

  await registerAllQueueHandlers();

  await queue.start();
  queue.ensureActive();
  if (config.queue.driver === 'bullmq') {
    logger.warn(
      'QUEUE_DRIVER=bullmq: run `npm run worker` in another terminal so jobs are consumed (Next.js only enqueues).',
    );
  } else {
    logger.info('queue worker started inside Next.js server (auto-instrumented)');
  }
}
