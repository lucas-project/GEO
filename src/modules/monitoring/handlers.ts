import { queue } from '@shared/queue';
import { runMonitoringFor, runMonitoringSweep } from './service';

export function registerMonitoringHandlers(): void {
  queue.process<{ siteId: string }, { runId: string; auditId: string | null }>(
    'monitoring.run',
    async (ctx) => {
      const run = await runMonitoringFor(ctx.job.payload.siteId, async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      });
      return { runId: run.id, auditId: run.auditId };
    },
  );

  queue.process<
    unknown,
    { sitesProcessed: number; totalAlerts: number; failed: number }
  >('monitoring.sweep', async () => runMonitoringSweep());
}
