/**
 * GEO Audit schemas — the contract every audit returns.
 *
 * Ten dimensions are scored, each 0-100 with reasons. Overall is a
 * weighted aggregate (see scoring.ts).
 */

import { z } from 'zod';

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

export const DimensionScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const IssueDetailsSchema = z.object({
  /** Pages or endpoints where this issue applies (audit URL, robots.txt, sitemap, crawled pages). */
  affectedUrls: z.array(z.string()),
  /** Full scoring reasons for this dimension. */
  reasons: z.array(z.string()),
  /** Actionable fix guidance. */
  recommendation: z.string().optional(),
  /** Optional on-page locations (section headings, chunks) when URLs alone are not enough. */
  locations: z.array(z.string()).optional(),
});
export type IssueDetails = z.infer<typeof IssueDetailsSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  dimension: z.enum(DIMENSIONS),
  impact: z.string().nullable().optional(),
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

export const AuditPageEntrySchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  statusCode: z.number().int().optional(),
  source: z.enum(['seed', 'sitemap', 'internal']),
  audited: z.boolean(),
  error: z.string().nullable().optional(),
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
  url: z.string(),
  overallScore: z.number().int().min(0).max(100),
  dimensions: z.record(z.enum(DIMENSIONS), DimensionScoreSchema),
  narrative: z.string().nullable(),
  topIssues: z.array(IssueSchema),
  topFixes: z.array(FixSchema),
  screenshotUrl: z.string().nullable(),
  pageInventory: PageInventorySchema.optional(),
  createdAt: z.string(),
});
export type GeoAuditResult = z.infer<typeof GeoAuditResultSchema>;
