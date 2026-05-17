/**
 * GEO Audit schemas — the contract every audit returns.
 *
 * Ten dimensions are scored, each 0-100 with reasons. Overall uses a
 * hierarchical pipeline (foundation → understanding → generation → outcome).
 */

import { z } from 'zod';

/** AI visibility pipeline layers (causal order). */
export const SCORE_LAYERS = [
  'foundation',
  'understanding',
  'generation',
  'outcome',
] as const;

export type ScoreLayer = (typeof SCORE_LAYERS)[number];

export const LAYER_LABELS: Record<ScoreLayer, string> = {
  foundation: 'Foundation',
  understanding: 'Understanding',
  generation: 'Generation',
  outcome: 'Outcome',
};

export const LAYER_DESCRIPTIONS: Record<ScoreLayer, string> = {
  foundation: 'Can AI crawl, parse structure, and read markup?',
  understanding: 'Can AI understand entities, chunks, and trust signals?',
  generation: 'Can AI extract answers and summarize content?',
  outcome: 'Will AI cite this page as a source?',
};

export const DIMENSIONS = [
  'aiReadability',
  'citationFriendliness',
  'semanticClarity',
  'entityClarity',
  'answerExtraction',
  'chunkOptimization',
  'summarizationQuality',
  'trustSignals',
  'structuredContent',
  'crawlerFriendliness',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  aiReadability: 'AI Readability',
  citationFriendliness: 'Citation Friendliness',
  semanticClarity: 'Semantic Clarity',
  entityClarity: 'Entity Clarity',
  answerExtraction: 'Answer Extraction',
  chunkOptimization: 'Chunk Optimization',
  summarizationQuality: 'Summarization Quality',
  trustSignals: 'Trust Signals',
  structuredContent: 'Structured Content',
  crawlerFriendliness: 'AI Crawler Friendliness',
};

export const DIMENSION_DESCRIPTIONS: Record<Dimension, string> = {
  aiReadability: 'How easily an LLM can parse the page text.',
  citationFriendliness: 'Likelihood the page will be cited as a source.',
  semanticClarity: 'Clarity of heading hierarchy and topical structure.',
  entityClarity: 'How clearly named entities are exposed.',
  answerExtraction: 'How well the page supports answer-first extraction.',
  chunkOptimization: 'Whether content is split into AI-friendly chunks.',
  summarizationQuality: 'How summarizable the content is.',
  trustSignals: 'Author / E-E-A-T indicators present.',
  structuredContent: 'JSON-LD schema and structured markup coverage.',
  crawlerFriendliness: 'AI crawler accessibility (robots, llms.txt, JS).',
};

export const DIMENSION_LAYERS: Record<Dimension, ScoreLayer> = {
  crawlerFriendliness: 'foundation',
  structuredContent: 'foundation',
  semanticClarity: 'foundation',
  entityClarity: 'understanding',
  chunkOptimization: 'understanding',
  aiReadability: 'understanding',
  trustSignals: 'understanding',
  answerExtraction: 'generation',
  summarizationQuality: 'generation',
  citationFriendliness: 'outcome',
};

export const DimensionScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const LayerScoreSchema = z.object({
  layer: z.enum(SCORE_LAYERS),
  rawScore: z.number().int().min(0).max(100),
  effectiveScore: z.number().int().min(0).max(100),
  dimensions: z.array(z.enum(DIMENSIONS)),
  weakestDimension: z.enum(DIMENSIONS).optional(),
});
export type LayerScore = z.infer<typeof LayerScoreSchema>;

export const GateAppliedSchema = z.object({
  type: z.enum([
    'crawler_blocked',
    'crawler_weak',
    'foundation_weak',
    'propagation',
    'answer_extraction_ceiling',
    'citation_snapshot',
  ]),
  description: z.string(),
  cap: z.number().optional(),
});
export type GateApplied = z.infer<typeof GateAppliedSchema>;

export const BottleneckSchema = z.object({
  layer: z.enum(SCORE_LAYERS),
  dimension: z.enum(DIMENSIONS),
  effectiveScore: z.number().int().min(0).max(100),
  reason: z.string(),
});
export type Bottleneck = z.infer<typeof BottleneckSchema>;

export const ScoringMetaSchema = z.object({
  modelVersion: z.literal('hierarchical-v1'),
  layers: z.record(z.enum(SCORE_LAYERS), LayerScoreSchema),
  citationProbability: z.number().min(0).max(1),
  bottleneck: BottleneckSchema,
  gatesApplied: z.array(GateAppliedSchema),
  overallCap: z.number().int().min(0).max(100).optional(),
  citationSnapshotVisibility: z.number().min(0).max(1).optional(),
  simulationRunCount: z.number().int().optional(),
});
export type ScoringMeta = z.infer<typeof ScoringMetaSchema>;

export const SourceRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export type SourceRange = z.infer<typeof SourceRangeSchema>;

export const PageCodeHighlightSchema = z.object({
  label: z.string(),
  kind: z.enum(['chunk', 'html']),
  content: z.string(),
  /** Why this region is flagged (shown in source viewer). */
  problem: z.string().optional(),
  /** Concrete fix guidance for this region. */
  fixHint: z.string().optional(),
  /** Copy-ready sample rewrite (template or AI-refined). */
  suggestedExample: z.string().optional(),
  /** Byte offsets in Playwright renderedHtml for reliable highlighting. */
  sourceRanges: z.array(SourceRangeSchema).optional(),
});
export type PageCodeHighlight = z.infer<typeof PageCodeHighlightSchema>;

export const PageIssueImpactSchema = z.object({
  url: z.string(),
  pathHint: z.string().optional(),
  pageReasons: z.array(z.string()),
  highlights: z.array(PageCodeHighlightSchema),
});
export type PageIssueImpact = z.infer<typeof PageIssueImpactSchema>;

export const IssueDetailsSchema = z.object({
  /** Pages or endpoints where this issue applies (audit URL, robots.txt, sitemap, crawled pages). */
  affectedUrls: z.array(z.string()),
  /** Full scoring reasons for this dimension. */
  reasons: z.array(z.string()),
  /** Actionable fix guidance. */
  recommendation: z.string().optional(),
  /** Optional on-page locations (section headings, chunks) when URLs alone are not enough. */
  locations: z.array(z.string()).optional(),
  /** Per-page evidence with focused snippets from Playwright / extraction. */
  impactedPages: z.array(PageIssueImpactSchema).optional(),
});
export type IssueDetails = z.infer<typeof IssueDetailsSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  /** Stable key for cross-audit aggregation, e.g. citationFriendliness:missing-faq-schema */
  issueKey: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  dimension: z.enum(DIMENSIONS),
  impact: z.string().nullable().optional(),
  /** Plain-language overview for the audit report (2–3 sentences). */
  summaryPlain: z.string().optional(),
  details: IssueDetailsSchema.optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const FixSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  effort: z.enum(['low', 'medium', 'high']),
  dimension: z.enum(DIMENSIONS),
  artifactType: z.enum(['faq-schema', 'llms-txt', 'ai-summary', 'answer-first', 'product-schema', 'metadata', 'generic']).nullable().optional(),
});
export type Fix = z.infer<typeof FixSchema>;

export const PAGE_ARCHETYPES = [
  'homepage',
  'faq',
  'qa',
  'glossary',
  'comparison',
  'documentation',
  'product',
  'blog',
  'content',
  'utility',
] as const;
export type PageArchetype = (typeof PAGE_ARCHETYPES)[number];

export const DISCOVERY_SOURCES = ['seed', 'sitemap', 'internal', 'llms', 'graph'] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];

export const AuditPageEntrySchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  statusCode: z.number().int().optional(),
  source: z.enum(['seed', 'sitemap', 'internal', 'llms', 'graph']),
  sources: z.array(z.enum(DISCOVERY_SOURCES)).optional(),
  audited: z.boolean(),
  error: z.string().nullable().optional(),
  geoScore: z.number().int().min(0).max(100).optional(),
  archetype: z.enum(PAGE_ARCHETYPES).optional(),
  signals: z.array(z.string()).optional(),
  probed: z.boolean().optional(),
});
export type AuditPageEntry = z.infer<typeof AuditPageEntrySchema>;

export const PageInventorySchema = z.object({
  pages: z.array(AuditPageEntrySchema),
  auditedCount: z.number().int(),
  discoveredCount: z.number().int(),
});
export type PageInventory = z.infer<typeof PageInventorySchema>;

export const GeoAuditResultSchema = z.object({
  id: z.string(),
  siteId: z.string().nullable().optional(),
  url: z.string(),
  overallScore: z.number().int().min(0).max(100),
  dimensions: z.record(z.enum(DIMENSIONS), DimensionScoreSchema),
  scoringMeta: ScoringMetaSchema.nullable().optional(),
  narrative: z.string().nullable(),
  topIssues: z.array(IssueSchema),
  topFixes: z.array(FixSchema),
  screenshotUrl: z.string().nullable(),
  pageInventory: PageInventorySchema.optional(),
  createdAt: z.string(),
});
export type GeoAuditResult = z.infer<typeof GeoAuditResultSchema>;
