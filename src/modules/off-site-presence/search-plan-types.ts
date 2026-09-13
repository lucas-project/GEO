import { z } from 'zod';

const PROBE_PLATFORM_IDS = [
  'reddit',
  'quora',
  'g2',
  'capterra',
  'trustpilot',
  'site_search',
  'whirlpool',
  'productreview',
  'ozbargain',
] as const;

export const SearchPlanCategorySchema = z.enum([
  'automotive',
  'b2b_saas',
  'consumer_brand',
  'marketplace',
  'local_service',
  'generic',
]);

export type SearchPlanCategory = z.infer<typeof SearchPlanCategorySchema>;

export const SearchPlanSkipSchema = z.object({
  id: z.string(),
  reason: z.string(),
});

export const AdditionalSourceSchema = z.object({
  id: z.string(),
  host: z.string(),
  label: z.string(),
  reason: z.string(),
});

export type AdditionalSource = z.infer<typeof AdditionalSourceSchema>;

export const PresenceSearchPlanSchema = z.object({
  category: SearchPlanCategorySchema,
  rationale: z.string(),
  probePlatforms: z.array(z.enum(PROBE_PLATFORM_IDS)),
  searchTargets: z.array(z.string()),
  skipPlatforms: z.array(SearchPlanSkipSchema),
  customQueries: z.array(z.string()).max(5).default([]),
  additionalSources: z.array(AdditionalSourceSchema).max(6).default([]),
  brandKeywords: z.array(z.string()).max(8).default([]),
  source: z.enum(['llm', 'heuristic']).default('heuristic'),
});

export type PresenceSearchPlan = z.infer<typeof PresenceSearchPlanSchema>;

export const SearchPlanLlmOutputSchema = z.object({
  category: SearchPlanCategorySchema,
  rationale: z.string(),
  probePlatforms: z.array(z.enum(PROBE_PLATFORM_IDS)).max(6),
  searchTargets: z.array(z.string()).max(12),
  skipPlatforms: z.array(SearchPlanSkipSchema),
  customQueries: z.array(z.string()).max(5),
  additionalSources: z.array(AdditionalSourceSchema).max(6).default([]),
  brandKeywords: z.array(z.string()).max(8).default([]),
});

export type SearchPlanLlmOutput = z.infer<typeof SearchPlanLlmOutputSchema>;
