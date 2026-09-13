import { z } from 'zod';

export const ObservationStatusSchema = z.enum([
  'observed', 'absent_in_scope', 'blocked', 'timeout', 'rate_limited',
  'parse_error', 'not_configured', 'not_run', 'legacy_unknown',
]);
export type ObservationStatus = z.infer<typeof ObservationStatusSchema>;

export const EvidenceMethodSchema = z.enum(['http', 'browser', 'search_snippet', 'api', 'user_supplied']);
export type EvidenceMethod = z.infer<typeof EvidenceMethodSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1), requestedUrl: z.string().min(1), finalUrl: z.string().min(1),
  capturedAt: z.string().datetime(), snapshotId: z.string().min(1), contentHash: z.string().optional(),
  method: EvidenceMethodSchema, status: ObservationStatusSchema, httpStatus: z.number().int().optional(),
  locator: z.string().optional(), excerpt: z.string().max(2000).optional(), entityId: z.string().optional(),
  sourceQuery: z.string().optional(), extractorVersion: z.string().min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const CriterionResultSchema = z.object({
  criterionId: z.string().min(1), ruleVersion: z.string().min(1),
  scope: z.enum(['page', 'site_sample', 'external_sample']),
  applicability: z.enum(['applicable', 'not_applicable', 'unknown']),
  outcome: z.enum(['pass', 'partial', 'fail', 'unknown']),
  earned: z.number().min(0).nullable(), possible: z.number().nonnegative(),
  confidence: z.enum(['high', 'medium', 'low', 'unrated']),
  confidenceReason: z.string().min(1), evidenceIds: z.array(z.string()), missingReason: z.string().optional(),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const EvidenceBundleSchema = z.object({
  snapshotId: z.string().min(1), capturedAt: z.string().datetime(), extractorVersion: z.string().min(1),
  evidence: z.array(EvidenceSchema), criteria: z.array(CriterionResultSchema), coverage: z.number().min(0).max(1),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
