/**
 * Executor — runs a plan step-by-step, persisting StepResults.
 *
 * Each step dispatches to the appropriate module's service.
 * Step outputs flow forward: e.g. an "audit" produces an auditId that a
 * subsequent "generate-fix" can reference.
 */

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { canonicalSiteUrlFromGoal, normalizeWebsiteUrl } from '@/lib/website-url';
import { logger } from '@shared/logger';
import { runAudit } from '@modules/geo-audit/server';
import { runSimulation } from '@modules/ai-simulation';
import { runComparison } from '@modules/competitor-analysis';
import { generateArtifact } from '@modules/optimization';
import { addMonitoredSite } from '@modules/monitoring';
import { queue } from '@shared/queue';
import type { Plan, StepResult } from './schemas';

const execLogger = logger.child({ module: 'geo-agent/executor' });

export interface ExecutorContext {
  recordId: string;
  goal?: string;
  onStepChange?: (results: StepResult[]) => Promise<void>;
}

export async function executePlan(plan: Plan, ctx: ExecutorContext): Promise<StepResult[]> {
  const goal = ctx.goal ?? '';
  const steps = plan.steps ?? [];
  const results: StepResult[] = steps.map((s) => ({
    type: s.type,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    output: null,
    error: null,
  }));

  await persistResults(ctx.recordId, results);
  await ctx.onStepChange?.(results);

  let lastAuditId: string | null = null;
  let lastAuditUrl: string | null = null;

  for (let i = 0; i < steps.length; i++) {
    const gate = await prisma.agentPlan.findUnique({
      where: { id: ctx.recordId },
      select: { stopRequested: true },
    });
    if (gate?.stopRequested) {
      for (let j = i; j < steps.length; j++) {
        if (results[j].status === 'pending') {
          results[j].status = 'skipped';
          results[j].error = 'Stopped by user';
          results[j].finishedAt = new Date().toISOString();
        }
      }
      await prisma.agentPlan.update({
        where: { id: ctx.recordId },
        data: { stopRequested: false },
      });
      await persistResults(ctx.recordId, results);
      await ctx.onStepChange?.(results);
      break;
    }

    const step = steps[i];
    results[i].status = 'running';
    results[i].startedAt = new Date().toISOString();
    await persistResults(ctx.recordId, results);
    await ctx.onStepChange?.(results);

    try {
      execLogger.info({ stepIndex: i, type: step.type }, 'executing step');
      let output: unknown = null;

      switch (step.type) {
        case 'audit': {
          const url =
            canonicalSiteUrlFromGoal(goal, step.url) ?? normalizeWebsiteUrl(step.url);
          execLogger.info({ url, goal }, 'audit URL resolved');
          const r = await runAudit({ url, goalHint: goal });
          lastAuditId = r.id;
          lastAuditUrl = r.url;
          output = { auditId: r.id, overallScore: r.overallScore, url: r.url };
          break;
        }
        case 'simulate': {
          const r = await runSimulation({
            prompt: step.prompt,
            targetBrand: step.targetBrand,
            targetUrl: lastAuditUrl ?? undefined,
          });
          output = {
            runId: r.runId,
            totalCitations: r.aggregate.totalCitations,
            brands: r.aggregate.brandLeaderboard.slice(0, 5),
          };
          break;
        }
        case 'competitor-compare': {
          const r = await runComparison({
            targetUrl: normalizeWebsiteUrl(step.targetUrl),
            competitorUrls: step.competitorUrls.map((u) => normalizeWebsiteUrl(u)),
          });
          lastAuditId = r.target.auditId;
          output = { comparisonId: r.id, gaps: r.gaps.length };
          break;
        }
        case 'generate-fix': {
          const auditId = step.auditId ?? lastAuditId;
          if (!auditId) throw new Error('no audit available for fix generation');
          const r = await generateArtifact({ auditId, type: step.artifactType });
          output = { artifactId: r.id, type: r.type };
          break;
        }
        case 'monitor-add': {
          const url =
            canonicalSiteUrlFromGoal(goal, step.url) ?? normalizeWebsiteUrl(step.url);
          const r = await addMonitoredSite(url, { monitorIntervalHours: 24 });
          const jobId = await queue.enqueue('monitoring.run', { siteId: r.siteId });
          output = { siteId: r.siteId, monitoringJobId: jobId };
          break;
        }
      }

      results[i].status = 'completed';
      results[i].output = output;
      results[i].finishedAt = new Date().toISOString();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      execLogger.warn({ stepIndex: i, type: step.type, err: message }, 'step failed');
      results[i].status = 'failed';
      results[i].error = message;
      results[i].finishedAt = new Date().toISOString();
    }

    if (results[i].status === 'failed') {
      for (let j = i + 1; j < steps.length; j++) {
        results[j].status = 'skipped';
        results[j].error = 'Skipped after a previous step failed';
        results[j].finishedAt = new Date().toISOString();
      }
    }

    await persistResults(ctx.recordId, results);
    await ctx.onStepChange?.(results);

    if (results[i].status === 'failed') {
      break;
    }
  }

  return results;
}

async function persistResults(recordId: string, results: StepResult[]): Promise<void> {
  await prisma.agentPlan.update({
    where: { id: recordId },
    data: {
      result: stringifyJson(results),
    },
  });
}

export async function loadAgentPlan(id: string) {
  const row = await prisma.agentPlan.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    goal: row.goal,
    plan: parseJson<Plan>(row.plan, { summary: '', steps: [] }),
    status: row.status as 'planned' | 'running' | 'completed' | 'failed',
    results: parseJson<StepResult[]>(row.result, []),
    createdAt: row.createdAt.toISOString(),
  };
}
