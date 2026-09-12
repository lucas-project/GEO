import { z } from 'zod';

export const PatternTypeSchema = z.enum([
  'schema',
  'faq',
  'chunk',
  'structure',
  'hierarchy',
  'entity',
  'table',
  'readability',
  'citation',
  'platform',
]);
export type PatternType = z.infer<typeof PatternTypeSchema>;

export const RollupSignalsSchema = z.object({
  schemaCoverage: z.object({
    types: z.array(z.string()),
    count: z.number().int(),
  }),
  faq: z.object({
    count: z.number().int(),
    schemaBacked: z.boolean(),
  }),
  chunks: z.object({
    count: z.number().int(),
    answerFirstRatio: z.number().nullable(),
    withLists: z.number().int(),
    withNumbers: z.number().int(),
  }),
  hierarchy: z.object({
    h1Count: z.number().int(),
    maxDepth: z.number().int(),
    skippedLevels: z.number().int(),
    outlineScore: z.number().int(),
  }),
  entities: z.object({
    top: z.array(z.object({ name: z.string(), kind: z.string() })),
    uniqueCount: z.number().int(),
    orgPresent: z.boolean(),
  }),
  tables: z.object({
    comparisonTableCount: z.number().int(),
    totalRows: z.number().int(),
  }),
  readability: z.object({
    aiReadability: z.number().int(),
    semanticClarity: z.number().int(),
    answerExtraction: z.number().int(),
    summarizationQuality: z.number().int(),
  }),
  authors: z.object({
    count: z.number().int(),
    hasByline: z.boolean(),
  }),
  presence: z
    .object({
      linkedPlatforms: z.array(z.string()),
      sameAsCount: z.number().int(),
      hasPricingPage: z.boolean(),
      hasPrimaryCta: z.boolean(),
    })
    .optional(),
  checklist: z
    .object({
      avgQuestionRatio: z.number().nullable(),
      altTextRatio: z.number().nullable(),
      pagesWithLeadDefinition: z.number().int(),
      pagesWithCaseStudy: z.number().int(),
      totalInternalLinks: z.number().int(),
      citationPhraseHits: z.number().int(),
    })
    .optional(),
  pipeline: z
    .object({
      citationProbability: z.number().min(0).max(1).optional(),
      bottleneckLayer: z.string().optional(),
      bottleneckDimension: z.string().optional(),
      layerScores: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
});
export type RollupSignals = z.infer<typeof RollupSignalsSchema>;

export const PatternStatMetadataSchema = z.object({
  withPatternAvgScore: z.number().optional(),
  withoutPatternAvgScore: z.number().optional(),
  liftPoints: z.number().optional(),
  liftPercent: z.number().optional(),
  citationRateWith: z.number().optional(),
  citationRateWithout: z.number().optional(),
  withCount: z.number().int().optional(),
  withoutCount: z.number().int().optional(),
  platforms: z
    .record(
      z.string(),
      z.object({
        sampleCount: z.number().int(),
        avgScore: z.number(),
        liftPoints: z.number().optional(),
      }),
    )
    .optional(),
});
export type PatternStatMetadata = z.infer<typeof PatternStatMetadataSchema>;

export const InsightKindSchema = z.enum([
  'score_lift',
  'citation_lift',
  'platform',
  'missing_pattern',
]);
export type InsightKind = z.infer<typeof InsightKindSchema>;

export const BenchmarkInsightSchema = z.object({
  insightKind: InsightKindSchema,
  category: z.enum(['structure', 'content', 'citations', 'platform', 'readability']),
  patternType: PatternTypeSchema,
  patternKey: z.string(),
  cohortKey: z.string(),
  sampleCount: z.number(),
  avgOverallScore: z.number().optional(),
  yourScore: z.number().optional(),
  delta: z.number().optional(),
  liftPoints: z.number().optional(),
  liftPercent: z.number().optional(),
  youHavePattern: z.boolean().optional(),
  /** Avg GEO score for sites that have this pattern (for charts) */
  withPatternAvgScore: z.number().optional(),
  /** Avg GEO score for sites without this pattern */
  withoutPatternAvgScore: z.number().optional(),
  /** Plain-language headline for the insight card */
  title: z.string(),
  /** One-sentence takeaway */
  summary: z.string(),
  /** Longer explanation for non-technical readers */
  explanation: z.string(),
  /** Combined text (LLM / legacy) */
  message: z.string(),
});
export type BenchmarkInsight = z.infer<typeof BenchmarkInsightSchema>;

export const PlaybookEntrySchema = z.object({
  issueKey: z.string(),
  artifactType: z.string().optional(),
  avgScoreLift: z.number().optional(),
  sampleCount: z.number(),
  recommendation: z.string(),
  patterns: z.array(z.string()),
});
export type PlaybookEntry = z.infer<typeof PlaybookEntrySchema>;

export const SiteTrendSchema = z.object({
  siteId: z.string(),
  scores: z.array(
    z.object({
      date: z.string(),
      score: z.number(),
      decayedScore: z.number().optional(),
    }),
  ),
});
export type SiteTrend = z.infer<typeof SiteTrendSchema>;

export const IntelligenceGraphSummarySchema = z.object({
  siteId: z.string(),
  latestSignals: RollupSignalsSchema.optional(),
  trend: SiteTrendSchema,
  citationVisibility: z.number().nullable(),
  patternTags: z.array(z.string()),
});
export type IntelligenceGraphSummary = z.infer<typeof IntelligenceGraphSummarySchema>;
