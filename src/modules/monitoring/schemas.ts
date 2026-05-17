/**
 * Monitoring schemas — Phase 4.
 */

import { z } from 'zod';

export const AlertSeveritySchema = z.enum(['info', 'warning', 'regression']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertKindSchema = z.enum([
  'score',
  'citation',
  'visibility',
  'schema',
  'structure',
  'entity',
  'readability',
  'extraction',
  'competitor',
  'issue',
]);
export type AlertKind = z.infer<typeof AlertKindSchema>;

export const AlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  kind: AlertKindSchema.optional(),
  title: z.string(),
  detail: z.string().nullable(),
  dimension: z.string().nullable(),
  delta: z.number().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const MonitorSchedulePresetSchema = z.enum(['12h', 'daily', 'weekly', 'adaptive']);
export type MonitorSchedulePreset = z.infer<typeof MonitorSchedulePresetSchema>;

export const MonitoringDiffPayloadSchema = z.object({
  fromAuditId: z.string().optional(),
  toAuditId: z.string().optional(),
  scores: z.object({
    overallDelta: z.number(),
    dimensionDeltas: z.record(z.string(), z.number()),
  }),
  schemas: z.object({ removed: z.array(z.string()), added: z.array(z.string()) }),
  faqs: z.object({ prevCount: z.number(), curCount: z.number() }),
  issues: z.object({ newCritical: z.array(z.string()), resolved: z.array(z.string()) }),
  citation: z
    .object({
      prevVisibility: z.number().nullable(),
      curVisibility: z.number().nullable(),
      delta: z.number().nullable(),
    })
    .optional(),
  entities: z
    .object({
      prevUnique: z.number(),
      curUnique: z.number(),
      orgLost: z.boolean(),
    })
    .optional(),
  hierarchy: z
    .object({
      prevOutlineScore: z.number(),
      curOutlineScore: z.number(),
      delta: z.number(),
    })
    .optional(),
  readability: z
    .object({
      aiReadabilityDelta: z.number(),
      semanticClarityDelta: z.number(),
    })
    .optional(),
  extraction: z
    .object({
      prevErrors: z.number(),
      curErrors: z.number(),
      prevPages: z.number(),
      curPages: z.number(),
    })
    .optional(),
  competitors: z
    .object({
      behindCount: z.number(),
      gapChanges: z.array(z.object({ competitorUrl: z.string(), gapDelta: z.number() })),
    })
    .optional(),
});
export type MonitoringDiffPayload = z.infer<typeof MonitoringDiffPayloadSchema>;

export const MonitorRunSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  auditId: z.string().nullable(),
  alerts: z.array(AlertSchema),
  runAt: z.string(),
});
export type MonitorRun = z.infer<typeof MonitorRunSchema>;
