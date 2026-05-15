import { queue } from '@shared/queue';
import { runMonitoringFor, runMonitoringSweep } from './service';

export function registerMonitoringHandlers(): void {
  queue.process<{ siteId: string }, { runId: string }>('monitoring.run', async (ctx) => {
    const run = await runMonitoringFor(ctx.job.payload.siteId);
    return { runId: run.id };
  });

  queue.process<unknown, { sitesProcessed: number; totalAlerts: number }>(
    'monitoring.sweep',
    async () => {
      return runMonitoringSweep();
    },
  );
}
