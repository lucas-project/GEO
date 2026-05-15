/**
 * GEO Agent schemas — Phase 5.
 *
 * The planner is constrained by Zod schemas: the LLM can only emit plan
 * steps that map to known module operations. This is the protective
 * boundary that keeps the autonomous agent from going off-script.
 */

import { z } from 'zod';

export const STEP_TYPES = [
  'audit',
  'simulate',
  'competitor-compare',
  'generate-fix',
  'monitor-add',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const AuditStepSchema = z.object({
  type: z.literal('audit'),
  url: z.string(),
  reason: z.string(),
});

export const SimulateStepSchema = z.object({
  type: z.literal('simulate'),
  prompt: z.string(),
  targetBrand: z.string().optional(),
  reason: z.string(),
});

export const CompetitorStepSchema = z.object({
  type: z.literal('competitor-compare'),
  targetUrl: z.string(),
  competitorUrls: z.array(z.string()).max(5),
  reason: z.string(),
});

export const GenerateFixStepSchema = z.object({
  type: z.literal('generate-fix'),
  auditId: z.string().nullable().describe('Pass null to use the most recent audit in the plan'),
  artifactType: z.enum(['faq-schema', 'llms-txt', 'ai-summary', 'answer-first', 'product-schema', 'metadata']),
  reason: z.string(),
});

export const MonitorAddStepSchema = z.object({
  type: z.literal('monitor-add'),
  url: z.string(),
  reason: z.string(),
});

export const PlanStepSchema = z.union([
  AuditStepSchema,
  SimulateStepSchema,
  CompetitorStepSchema,
  GenerateFixStepSchema,
  MonitorAddStepSchema,
]);
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  summary: z.string(),
  steps: z.array(PlanStepSchema).max(10),
});
export type Plan = z.infer<typeof PlanSchema>;

export const StepResultSchema = z.object({
  type: z.enum(STEP_TYPES),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const AgentPlanRecordSchema = z.object({
  id: z.string(),
  goal: z.string(),
  plan: PlanSchema,
  status: z.enum(['planned', 'running', 'completed', 'failed']),
  results: z.array(StepResultSchema),
  createdAt: z.string(),
});
export type AgentPlanRecord = z.infer<typeof AgentPlanRecordSchema>;
