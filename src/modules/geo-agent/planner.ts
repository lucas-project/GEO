/**
 * Planner — converts a natural language goal into a typed plan.
 */

import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import { extractWebsiteFromText, goalLooksLikeWebsite } from '@/lib/website-url';
import { config } from '@shared/config';
import { PLANNER_SYSTEM, buildPlannerPrompt } from './prompts';
import { buildMockAgentPlan, normalizePlanUrls } from './mock-plan';
import { PlanSchema, type Plan } from './schemas';

const plannerLogger = logger.child({ module: 'geo-agent/planner' });

function auditFallbackPlan(goal: string, reason: string): Plan {
  const url = extractWebsiteFromText(goal);
  if (url) {
    return normalizePlanUrls(
      {
        summary: reason,
        steps: [{ type: 'audit', url, reason: 'Baseline audit before any further action.' }],
      },
      goal,
    );
  }
  return buildMockAgentPlan(goal);
}

function usesMockPlanner(): boolean {
  return config.ai.provider === 'mock' || ai.name === 'mock';
}

export async function planFromGoal(goal: string): Promise<Plan> {
  plannerLogger.info({ goal }, 'planning from goal');

  if (goalLooksLikeWebsite(goal)) {
    const plan = normalizePlanUrls(buildMockAgentPlan(goal), goal);
    plannerLogger.info({ steps: plan.steps.length }, 'bare-domain goal plan');
    return plan;
  }

  if (usesMockPlanner()) {
    const mockPlan = normalizePlanUrls(buildMockAgentPlan(goal), goal);
    plannerLogger.info({ steps: mockPlan.steps.length }, 'using mock agent plan');
    return mockPlan;
  }

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: PlanSchema,
      schemaName: 'GeoAgentPlan',
      system: PLANNER_SYSTEM,
      prompt: buildPlannerPrompt(goal),
      temperature: 0.2,
    });

    const steps = Array.isArray(data.steps) ? data.steps : [];
    const summary = typeof data.summary === 'string' ? data.summary : 'Agent plan';

    if (steps.length === 0) {
      return auditFallbackPlan(goal, 'Default plan: run a baseline audit (planner returned no steps).');
    }

    const normalized = PlanSchema.safeParse({ summary, steps });
    if (!normalized.success) {
      plannerLogger.warn({ err: normalized.error.message }, 'plan failed schema check; using URL fallback if possible');
      return auditFallbackPlan(goal, 'Default plan: planner output was invalid; running baseline audit.');
    }

    return normalizePlanUrls(normalized.data, goal);
  } catch (err) {
    plannerLogger.warn({ err: (err as Error).message }, 'planner generateStructuredOutput failed');
    return auditFallbackPlan(goal, 'Default plan: planner call failed; running baseline audit if a URL is present.');
  }
}
