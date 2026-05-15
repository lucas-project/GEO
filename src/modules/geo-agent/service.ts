/**
 * GEO Agent service — Phase 5 entry point.
 *
 * planFromGoal() persists a plan; runPlan() executes a persisted plan;
 * planAndRun() is the convenience wrapper used by the API + UI.
 */

import { prisma, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { queue } from '@shared/queue';
import { planFromGoal } from './planner';
import { normalizePlanUrls } from './mock-plan';
import { executePlan, loadAgentPlan } from './executor';
import type { Plan, StepResult } from './schemas';

const agentLogger = logger.child({ module: 'geo-agent' });

export interface CreatePlanResult {
  id: string;
  plan: Plan;
}

export async function createPlan(goal: string): Promise<CreatePlanResult> {
  const plan = await planFromGoal(goal);
  const row = await prisma.agentPlan.create({
    data: {
      goal,
      plan: stringifyJson(plan),
      status: 'planned',
      result: stringifyJson([]),
    },
  });
  agentLogger.info({ planId: row.id, steps: plan.steps?.length ?? 0 }, 'plan created');
  return { id: row.id, plan };
}

/** Enqueue execution: mark running, enqueue job, store job id for cancel. */
export async function enqueueAgentRun(planId: string): Promise<string> {
  const row = await prisma.agentPlan.findUnique({ where: { id: planId } });
  if (!row) throw new Error(`agent plan ${planId} not found`);
  await prisma.agentPlan.update({
    where: { id: planId },
    data: { status: 'running', stopRequested: false },
  });
  const jobId = await queue.enqueue('agent.run', { planId });
  await prisma.agentPlan.update({
    where: { id: planId },
    data: { activeJobId: jobId },
  });
  return jobId;
}

export interface RequestStopResult {
  /** True when the run was still queued and we reverted the plan to `planned`. */
  revertedToPlanned: boolean;
}

/**
 * Stop a running plan: cancel a pending queue job, or set `stopRequested` so the
 * executor exits after the current step.
 */
export async function requestAgentStop(planId: string): Promise<RequestStopResult> {
  const plan = await prisma.agentPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error(`agent plan ${planId} not found`);
  if (plan.status !== 'running') {
    throw new Error('plan is not running');
  }

  const jobId = plan.activeJobId;
  if (jobId) {
    const row = await prisma.job.findUnique({ where: { id: jobId } });
    if (row?.status === 'pending') {
      await queue.cancel(jobId);
      const row2 = await prisma.job.findUnique({ where: { id: jobId } });
      if (row2?.status === 'cancelled' && !row2.startedAt) {
        await prisma.agentPlan.update({
          where: { id: planId },
          data: {
            status: 'planned',
            activeJobId: null,
            stopRequested: false,
          },
        });
        return { revertedToPlanned: true };
      }
    }
  }

  await prisma.agentPlan.update({
    where: { id: planId },
    data: { stopRequested: true },
  });
  return { revertedToPlanned: false };
}

export async function runPlan(planId: string, opts?: { queueJobId?: string }): Promise<StepResult[]> {
  try {
    const row = await prisma.agentPlan.findUnique({ where: { id: planId } });
    if (!row) throw new Error(`agent plan ${planId} not found`);

    if (opts?.queueJobId) {
      const j = await prisma.job.findUnique({ where: { id: opts.queueJobId } });
      if (j?.status === 'cancelled') {
        await prisma.agentPlan.update({
          where: { id: planId },
          data: { status: 'planned', activeJobId: null, stopRequested: false },
        });
        return [];
      }
    }

    if (row.stopRequested) {
      await prisma.agentPlan.update({
        where: { id: planId },
        data: { stopRequested: false, status: 'planned', activeJobId: null },
      });
      return [];
    }

    const plan = normalizePlanUrls(JSON.parse(row.plan) as Plan, row.goal);
    const steps = plan.steps ?? [];

    await prisma.agentPlan.update({
      where: { id: planId },
      data: { plan: stringifyJson(plan) },
    });

    if (steps.length === 0) {
      await prisma.agentPlan.update({
        where: { id: planId },
        data: { status: 'completed', result: stringifyJson([]) },
      });
      return [];
    }

    await prisma.agentPlan.update({ where: { id: planId }, data: { status: 'running' } });
    let results: StepResult[] = [];
    try {
      results = await executePlan(plan, { recordId: planId, goal: row.goal });
      const anyFailed = results.some((r) => r.status === 'failed');
      const userStopped = results.some(
        (r) => r.status === 'skipped' && typeof r.error === 'string' && r.error.includes('Stopped by user'),
      );
      await prisma.agentPlan.update({
        where: { id: planId },
        data: { status: anyFailed || userStopped ? 'failed' : 'completed' },
      });
    } catch (err) {
      agentLogger.error({ planId, err }, 'execution crashed');
      await prisma.agentPlan.update({ where: { id: planId }, data: { status: 'failed' } });
      throw err;
    }
    return results;
  } finally {
    await prisma.agentPlan
      .update({
        where: { id: planId },
        data: { activeJobId: null, stopRequested: false },
      })
      .catch(() => {});
  }
}

export async function getPlan(planId: string) {
  return loadAgentPlan(planId);
}

/** Rebuild steps from the stored goal (fixes truncated URLs in old plans). */
export async function replanFromGoal(planId: string): Promise<Plan> {
  const row = await prisma.agentPlan.findUnique({ where: { id: planId } });
  if (!row) throw new Error(`agent plan ${planId} not found`);
  const plan = await planFromGoal(row.goal);
  await prisma.agentPlan.update({
    where: { id: planId },
    data: {
      plan: stringifyJson(plan),
      status: 'planned',
      result: stringifyJson([]),
      stopRequested: false,
      activeJobId: null,
    },
  });
  agentLogger.info({ planId, steps: plan.steps.length }, 'plan refreshed from goal');
  return plan;
}

export const geoAgentService = {
  createPlan,
  runPlan,
  getPlan,
  replanFromGoal,
  enqueueAgentRun,
  requestAgentStop,
};
