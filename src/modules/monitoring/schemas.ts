/**
 * Monitoring schemas — Phase 4.
 */

import { z } from 'zod';

export const AlertSeveritySchema = z.enum(['info', 'warning', 'regression']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  title: z.string(),
  detail: z.string().nullable(),
  dimension: z.string().nullable(),
  delta: z.number().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const MonitorRunSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  auditId: z.string().nullable(),
  alerts: z.array(AlertSchema),
  runAt: z.string(),
});
export type MonitorRun = z.infer<typeof MonitorRunSchema>;
