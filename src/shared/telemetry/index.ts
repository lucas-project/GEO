/**
 * Telemetry — minimal counters/timers for AI/queue activity.
 *
 * Currently in-memory only; the API mirrors what a real OpenTelemetry
 * integration would expose, so swapping it later is mechanical.
 */

import { logger } from '@shared/logger';

const counters = new Map<string, number>();

export const telemetry = {
  increment(name: string, value = 1, attrs?: Record<string, string | number>): void {
    const key = attrs ? `${name}{${Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join(',')}}` : name;
    counters.set(key, (counters.get(key) ?? 0) + value);
  },

  snapshot(): Record<string, number> {
    return Object.fromEntries(counters.entries());
  },

  async timed<T>(name: string, fn: () => Promise<T>, attrs?: Record<string, string | number>): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - t0;
      logger.debug({ telemetry: name, ms, ...attrs }, 'timing');
      this.increment(`${name}.count`, 1, attrs);
      this.increment(`${name}.total_ms`, ms, attrs);
      return result;
    } catch (err) {
      this.increment(`${name}.errors`, 1, attrs);
      throw err;
    }
  },
};
