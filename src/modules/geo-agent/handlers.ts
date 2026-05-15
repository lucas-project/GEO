import { queue } from '@shared/queue';
import { runPlan } from './service';

export function registerAgentHandlers(): void {
  queue.process<{ planId: string }, { stepsCompleted: number }>('agent.run', async (ctx) => {
    try {
      const results = await runPlan(ctx.job.payload.planId, { queueJobId: ctx.job.id });
      return { stepsCompleted: results.filter((r) => r.status === 'completed').length };
    } catch (err) {
      // runPlan persists step-level errors; avoid marking the queue job failed without a plan update.
      const plan = await import('./service').then((m) => m.getPlan(ctx.job.payload.planId));
      if (plan?.results?.length) {
        return { stepsCompleted: plan.results.filter((r) => r.status === 'completed').length };
      }
      throw err;
    }
  });
}
