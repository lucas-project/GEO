/**
 * Competitor Analysis schemas — Phase 2b.
 */

import { z } from 'zod';
import { DimensionScoreSchema } from '@modules/geo-audit';

export const SiteSummarySchema = z.object({
  url: z.string(),
  auditId: z.string(),
  overallScore: z.number().int().min(0).max(100),
  dimensions: z.record(z.string(), DimensionScoreSchema),
  entities: z.array(z.object({ name: z.string(), kind: z.string(), relevance: z.number() })),
  schemaTypes: z.array(z.string()),
  faqCount: z.number().int(),
  authorCount: z.number().int(),
});
export type SiteSummary = z.infer<typeof SiteSummarySchema>;

export const DimensionGapSchema = z.object({
  dimension: z.string(),
  target: z.number(),
  competitor: z.number(),
  gap: z.number(),
});
export type DimensionGap = z.infer<typeof DimensionGapSchema>;

export const FailedCompetitorSchema = z.object({
  url: z.string(),
  error: z.string(),
});
export type FailedCompetitor = z.infer<typeof FailedCompetitorSchema>;

export const CompetitorComparisonSchema = z.object({
  id: z.string(),
  target: SiteSummarySchema,
  competitors: z.array(SiteSummarySchema),
  gaps: z.array(
    z.object({
      competitorUrl: z.string(),
      overallGap: z.number(),
      dimensionGaps: z.array(DimensionGapSchema),
      entitiesAhead: z.array(z.string()),
      entitiesBehind: z.array(z.string()),
      schemaAhead: z.array(z.string()),
      schemaBehind: z.array(z.string()),
    }),
  ),
  failedCompetitors: z.array(FailedCompetitorSchema).optional(),
  createdAt: z.string(),
});
export type CompetitorComparison = z.infer<typeof CompetitorComparisonSchema>;
