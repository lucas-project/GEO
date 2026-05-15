/**
 * Logger — pino-based structured logging with AI-call hooks.
 *
 * Use `logger.child({ module: 'geo-audit' })` inside modules so log lines
 * include the originating module. The dedicated `aiLogger` is a child
 * pre-tagged for AI provider calls (used by shared/ai).
 */

import pino from 'pino';
import { config } from '@shared/config';

const isBrowser = typeof window !== 'undefined';

const baseOptions: pino.LoggerOptions = {
  level: config.logging.level,
  base: { app: 'geo-ai-os' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function createServerLogger() {
  if (config.logging.pretty) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,app',
        },
      },
    });
  }
  return pino(baseOptions);
}

function createBrowserStub(): pino.Logger {
  // Minimal browser-side stub; we don't ship pino to the client bundle.
  // Only used if anything client-side mistakenly imports this; warns silently.
  const noop = () => {};
  return {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: noop,
    trace: noop,
    fatal: console.error.bind(console),
    child: () => createBrowserStub(),
  } as unknown as pino.Logger;
}

export const logger: pino.Logger = isBrowser ? createBrowserStub() : createServerLogger();

export const aiLogger = logger.child({ module: 'shared/ai' });
export const queueLogger = logger.child({ module: 'shared/queue' });
export const crawlLogger = logger.child({ module: 'crawling' });
