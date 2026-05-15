import { queue } from '@shared/queue';
import { runSimulation } from './service';

export function registerSimulationHandlers(): void {
  queue.process<
    {
      prompt: string;
      targetBrand?: string;
      targetUrl?: string;
      runsPerPlatform?: number;
      contextAuditId?: string;
    },
    { runId: string }
  >(
    'ai-simulation.run',
    async (ctx) => {
      const result = await runSimulation({
        ...ctx.job.payload,
        onProgress: async (p, msg) => {
          ctx.log(msg, { progress: p });
          await ctx.reportProgress(p);
        },
      });
      return { runId: result.runId };
    },
  );
}
