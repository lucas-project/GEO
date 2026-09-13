/**
 * GEO Audit schemas — the contract every audit returns.
 *
 * Twelve dimensions are scored, each 0-100 with reasons. Overall uses a
 * hierarchical pipeline (foundation → understanding → presence → generation → outcome).
 */

import { z } from 'zod';
import { PresenceSignalsSchema } from '@modules/brand-presence';
// Schema-only dependency avoids loading the off-site report/server graph.
// eslint-disable-next-line no-restricted-imports
import { OffSitePresenceReportSchema } from '@modules/off-site-presence/schemas';
import { SimulationPromptEntrySchema } from './simulation-prompts';
import { SiteChecklistSignalsSchema, RefCategoryScoresSchema } from './checklist-schema';
import { EvidenceBundleSchema } from './evidence-schema';
import { SiteProfileSchema } from '@modules/extraction';

/** AI visibility pipeline layers (causal order). */
export const SCORE_LAYERS = [
  'foundation',
  'understanding',
  'presence',
  'generation',
  'outcome',
] as const;

export type ScoreLayer = (typeof SCORE_LAYERS)[number];

export const LAYER_LABELS: Record<ScoreLayer, string> = {
  foundation: 'Foundation',
  understanding: 'Understanding',
  presence: 'Presence',
  generation: 'Generation',
  outcome: 'Outcome',
};

export const LAYER_DESCRIPTIONS: Record<ScoreLayer, string> = {
  foundation: 'Can AI crawl, parse structure, and read markup?',
  understanding: 'Can AI understand entities, chunks, and trust signals?',
  presence: 'Does AI see your brand beyond this website?',
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
  'offSitePresence',
  'commercialReadiness',
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
  offSitePresence: 'Off-site Presence',
  commercialReadiness: 'Commercial Readiness',
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
  offSitePresence: 'Linked profiles on Reddit, reviews, and social platforms.',
  commercialReadiness: 'Clear CTAs, pricing, and trust signals for conversion.',
};

export const DIMENSION_LAYERS: Record<Dimension, ScoreLayer> = {
  crawlerFriendliness: 'foundation',
  structuredContent: 'foundation',
  semanticClarity: 'foundation',
  entityClarity: 'understanding',
  chunkOptimization: 'understanding',
  aiReadability: 'understanding',
  trustSignals: 'understanding',
  offSitePresence: 'presence',
  answerExtraction: 'generation',
  summarizationQuality: 'generation',
  citationFriendliness: 'outcome',
  commercialReadiness: 'outcome',
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
    'off_site_presence_weak',
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

export const LayerEvidenceItemSchema = z.object({
  label: z.string(),
  detail: z.string().optional(),
  url: z.string().optional(),
});
export type LayerEvidenceItem = z.infer<typeof LayerEvidenceItemSchema>;

export const LayerSearchHitSchema = z.object({
  link: z.string(),
  snippet: z.string(),
});

export const LayerSearchQuerySchema = z.object({
  query: z.string(),
  resultCount: z.number().int(),
  topHits: z.array(LayerSearchHitSchema),
});

export const LayerEvidenceSchema = z.object({
  layer: z.enum(SCORE_LAYERS),
  methodology: z.string(),
  pagesAudited: z.array(z.string()).optional(),
  searchQueries: z.array(LayerSearchQuerySchema).optional(),
  crawlFindings: z.array(LayerEvidenceItemSchema),
  externalFindings: z.array(LayerEvidenceItemSchema),
  scoreFactors: z.array(z.string()),
});
export type LayerEvidence = z.infer<typeof LayerEvidenceSchema>;

/** One saved batch visibility run on an audit. */
export const SimulationVisibilityCheckSchema = z.object({
  checkedAt: z.string(),
  executionMode: z.enum(['mock', 'local', 'persona', 'live', 'mixed', 'legacy_unknown']).optional(),
  platformModes: z.record(z.enum(['chatgpt', 'gemini', 'claude', 'perplexity']), z.enum(['mock', 'local', 'persona', 'live', 'mixed', 'legacy_unknown'])).optional(),
  /** Discovery (non-brand) questions only. */
  promptsTested: z.number().int().min(0),
  promptsCiting: z.number().int().min(0),
  averageVisibilityScore: z.number().min(0).max(100),
  brandPromptsTested: z.number().int().min(0).optional(),
  brandLeaderboard: z
    .array(z.object({ brand: z.string(), count: z.number().int().min(1) }))
    .optional(),
  domainLeaderboard: z
    .array(z.object({ domain: z.string(), count: z.number().int().min(1) }))
    .optional(),
  results: z.array(
    z.object({
      prompt: z.string(),
      runId: z.string(),
      questionType: z.enum(['brand', 'discovery']).optional(),
      visibilityScore: z.number().min(0).max(100),
      mentionedOnPlatforms: z.array(z.enum(['chatgpt', 'gemini', 'claude', 'perplexity'])),
      platformDetails: z
        .array(
          z.object({
            platform: z.enum(['chatgpt', 'gemini', 'claude', 'perplexity']),
            cited: z.boolean(),
            citationCount: z.number().int().min(0),
            citedDomains: z.array(z.string()),
            excerpts: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      citationHighlights: z
        .array(
          z.object({
            platform: z.enum(['chatgpt', 'gemini', 'claude', 'perplexity']),
            snippet: z.string(),
            brand: z.string().optional(),
            domain: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type SimulationVisibilityCheck = z.infer<typeof SimulationVisibilityCheckSchema>;

export const ScoringMetaSchema = z.object({
  modelVersion: z.enum(['hierarchical-v1', 'hierarchical-v2']),
  scoreVersion: z.string().optional(),
  coverage: z.number().min(0).max(1).optional(),
  completion: z.enum(['complete', 'partial', 'failed']).optional(),
  stopReason: z.string().optional(),
  requestedPages: z.number().int().nonnegative().optional(),
  auditedPages: z.number().int().nonnegative().optional(),
  discoveredPages: z.number().int().nonnegative().optional(),
  sampleCoverage: z.number().min(0).max(1).optional(),
  discoveryCoverage: z.number().min(0).max(1).optional(),
  sampleCoverageStatus: z.enum(['ready', 'partial', 'insufficient_evidence']).optional(),
  evidenceBundle: EvidenceBundleSchema.optional(),
  siteProfile: SiteProfileSchema.optional(),
  /**
   * v3 is an evidence-only content and technical readiness score. It is kept
   * beside the historical hierarchical score so old reports are never silently
   * reinterpreted.
   */
  readiness: z
    .object({
      ruleVersion: z.string(),
      score: z.number().int().min(0).max(100).nullable(),
      coverage: z.number().min(0).max(1),
      coverageStatus: z.enum(['ready', 'preliminary', 'insufficient_evidence']),
      observedWeight: z.number().positive().optional(),
      applicableWeight: z.number().positive().optional(),
      pendingApplicabilityWeight: z.number().nonnegative(),
      range: z
        .object({ min: z.number().int().min(0).max(100), max: z.number().int().min(0).max(100) })
        .nullable(),
      criteria: z.array(EvidenceBundleSchema.shape.criteria.element),
    })
    .optional(),
  layers: z.record(z.enum(SCORE_LAYERS), LayerScoreSchema),
  citationProbability: z.number().min(0).max(1),
  bottleneck: BottleneckSchema,
  gatesApplied: z.array(GateAppliedSchema),
  overallCap: z.number().int().min(0).max(100).optional(),
  citationSnapshotVisibility: z.number().min(0).max(1).optional(),
  simulationRunCount: z.number().int().optional(),
  presenceSignals: PresenceSignalsSchema.optional(),
  checklist: SiteChecklistSignalsSchema.optional(),
  refCategories: RefCategoryScoresSchema.optional(),
  auxiliaryScores: z
    .object({
      technicalPerformance: z.number().int().min(0).max(100).optional(),
      topicCoverage: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
  shareOfModel: z.number().min(0).max(1).optional(),
  presenceProbe: z
    .object({
      source: z.enum(['crawl-only', 'serper', 'tavily']),
      brandName: z.string().optional(),
      siteDomain: z.string().optional(),
      redditMentionEstimate: z.number().nullable(),
      reviewProfilesFound: z.array(z.string()),
      mediaMentions: z.number(),
      primarySourceDomains: z.array(z.string()),
      brandDescriptionSnippet: z.string().nullable(),
      verifiedPlatforms: z.array(z.string()).optional(),
      searchQueries: z.array(LayerSearchQuerySchema).optional(),
    })
    .optional(),
  platformWeights: z.record(z.string(), z.number()).optional(),
  layerEvidence: z.record(z.enum(SCORE_LAYERS), LayerEvidenceSchema).optional(),
  offSitePresenceReport: OffSitePresenceReportSchema.optional(),
  offSitePresenceScannedAt: z.string().optional(),
  /** AI-generated simulation questions tailored to this site's weaknesses. */
  suggestedSimulationPrompts: z
    .array(z.union([z.string(), SimulationPromptEntrySchema]))
    .optional(),
  /** LLM-inferred competitor domains for pre-populating the comparison page. */
  suggestedCompetitors: z.array(z.string()).optional(),
  /** Latest batch AI visibility test (discovery metrics + per-question results). */
  simulationVisibilityCheck: SimulationVisibilityCheckSchema.optional(),
  /** Prior batch runs, newest archived first when a new batch completes. */
  simulationVisibilityHistory: z.array(SimulationVisibilityCheckSchema).optional(),
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
  observationStatus: z.enum(['observed', 'blocked', 'timeout', 'rate_limited', 'parse_error', 'not_run', 'legacy_unknown']).optional(),
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
  revision: z.number().int().positive().optional(),
  siteId: z.string().nullable().optional(),
  url: z.string(),
  overallScore: z.number().int().min(0).max(100),
  status: z.enum(['completed', 'partial', 'failed']).optional(),
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
