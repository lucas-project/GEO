/**
 * GEO Agent module — public surface (Phase 5).
 */

export {
  geoAgentService,
  createPlan,
  runPlan,
  getPlan,
  replanFromGoal,
  enqueueAgentRun,
  requestAgentStop,
} from './service';
export { planFromGoal } from './planner';
export { executePlan } from './executor';
export { registerAgentHandlers } from './handlers';
export type {
  Plan,
  PlanStep,
  StepType,
  StepResult,
  AgentPlanRecord,
} from './schemas';
