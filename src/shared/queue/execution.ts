import { prisma, stringifyJson } from '@shared/database/client';
import { TaskBudget, withTaskBudget, BudgetExceeded } from '@shared/ai/budget';
import type { JobContext, JobHandler } from './types';

/** Persist usage while running, including cancellation and failure paths. */
export async function executeWithBudget(ctx: JobContext, handler: JobHandler, leaseToken: string) {
  const budget = new TaskBudget(ctx.signal);
  ctx.budget = budget;
  const flush = async () => {
    await prisma.job.updateMany({ where: { id: ctx.job.id, leaseToken }, data: {
      usage: stringifyJson(budget.snapshot()), budget: stringifyJson(budget.limits),
      heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + 300000),
    } });
  };
  const heartbeat = setInterval(() => { void flush().catch(() => {}); }, 10000);
  try {
    await flush();
    return await withTaskBudget(budget, async () => {
      try {
        const result = await handler(ctx);
        return budget.stopReason ? { ...(result as object ?? {}), completion: 'partial', stopReason: budget.stopReason } : result;
      }
      catch (error) {
        if (!(error instanceof BudgetExceeded)) throw error;
        return { ...(budget.partialResult as object ?? {}), completion: 'partial', stopReason: error.resource };
      }
    });
  } finally { clearInterval(heartbeat); await flush(); }
}
