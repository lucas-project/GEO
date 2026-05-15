/**
 * AI Simulation schemas — Phase 2.
 */

import { z } from 'zod';

export const PLATFORMS = ['chatgpt', 'gemini', 'claude', 'perplexity'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CitationSchema = z.object({
  url: z.string().nullable(),
  brand: z.string().nullable(),
  domain: z.string().nullable(),
  /** 1-indexed position within the response (rank). */
  position: z.number().int().min(1),
  snippet: z.string().max(400).nullable(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const BrandMentionSchema = z.object({
  brand: z.string(),
  count: z.number().int().min(1),
});
export type BrandMention = z.infer<typeof BrandMentionSchema>;

export const SimulationRunSchema = z.object({
  id: z.string(),
  platform: z.enum(PLATFORMS),
  responseText: z.string(),
  citations: z.array(CitationSchema),
  brandMentions: z.array(BrandMentionSchema),
  model: z.string(),
  provider: z.string(),
  tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
});
export type SimulationRun = z.infer<typeof SimulationRunSchema>;

export const SimulationResultSchema = z.object({
  runId: z.string(),
  prompt: z.string(),
  runs: z.array(SimulationRunSchema),
  aggregate: z.object({
    totalCitations: z.number().int(),
    brandLeaderboard: z.array(BrandMentionSchema),
    domainLeaderboard: z.array(z.object({ domain: z.string(), count: z.number().int() })),
    /** Visibility = (mentions / total platforms) for the target brand if any. */
    targetVisibility: z
      .object({
        brand: z.string(),
        mentionedOnPlatforms: z.array(z.enum(PLATFORMS)),
        visibilityScore: z.number().min(0).max(100),
      })
      .nullable(),
  }),
  createdAt: z.string(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
