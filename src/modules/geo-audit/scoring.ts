/**
 * GEO scoring engine — deterministic scoring across the 10 blueprint
 * dimensions. Each dimension function returns 0-100 and an explanation list.
 *
 * The dimensions intentionally use overlapping signals because a real GEO
 * audit cares about the same content from multiple angles (entity clarity
 * for citation vs entity clarity for summarization, etc.). Weighting is
 * applied in `aggregate()`.
 */

import { canonicalPageUrl } from '@/lib/website-url';
import { buildIssueKey } from '@modules/intelligence';
import type { CrawlResult, CrawledPage, RobotsInfo } from '@modules/crawling';
import type { PageExtraction, SchemaBlock } from '@modules/extraction';
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_LAYERS,
  type Dimension,
  type DimensionScore,
  type Issue,
  type Fix,
  type ScoringMeta,
} from './schemas';
import { computeHierarchicalScore } from './hierarchical-scoring';
import type { CalibrationWeights } from './calibration';
import { buildImpactedPages, pathHint } from './issue-evidence';
import {
  isNegativeReason,
  plainImpact,
  plainIssueSummary,
  plainDimensionRecommendation,
  plainIssueRecommendation,
  expandReason,
} from './plain-language';
import {
  canonicalCategoryForReason,
  canonicalIssueId,
  normalizeReasonText,
  type CanonicalIssueCategory,
} from './issue-categories';

export interface PageExtractionInput {
  page: CrawledPage;
  extraction: PageExtraction;
}

export interface ScoringContext {
  url: string;
  rootPage: CrawledPage;
  extraction: PageExtraction;
  crawl: CrawlResult;
  /** When set, dimension scores aggregate across all audited pages (homepage 2× weight). */
  pageExtractions?: PageExtractionInput[];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function hasSchemaType(schemas: SchemaBlock[], type: string): boolean {
  return schemas.some((s) => s.type === type);
}

// ---------- Dimension scorers ----------

function scoreAiReadability(ctx: ScoringContext): DimensionScore {
  const text = ctx.extraction.chunks.map((c) => c.text).join(' ');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  const avgSentLen = sentences.length ? wordCount / sentences.length : 0;

  let score = 50;
  const reasons: string[] = [];

  if (wordCount > 400) {
    score += 15;
    reasons.push(`Adequate body length (${wordCount} words)`);
  } else if (wordCount < 120) {
    score -= 25;
    reasons.push('Body content is very short, limiting LLM parsing');
  }

  if (avgSentLen > 0 && avgSentLen < 28) {
    score += 12;
    reasons.push(`Sentence length is parsable (avg ${avgSentLen.toFixed(0)} words)`);
  } else if (avgSentLen >= 35) {
    score -= 12;
    reasons.push('Sentences too long; LLM extraction suffers');
  }

  if (ctx.extraction.metadata.language) {
    score += 6;
    reasons.push('HTML lang attribute is set');
  } else {
    score -= 6;
    reasons.push('Missing <html lang> attribute');
  }

  if (ctx.rootPage.hydrationDelta && ctx.rootPage.hydrationDelta.addedTextChars > 500) {
    score -= 14;
    reasons.push('Significant content appears only after JS — many AI crawlers skip JS');
  }

  return { score: clamp(score), reasons };
}

function scoreCitationFriendliness(ctx: ScoringContext): DimensionScore {
  let score = 45;
  const reasons: string[] = [];
  const { extraction } = ctx;

  if (extraction.faqs.length > 0) {
    score += 18;
    reasons.push(`${extraction.faqs.length} FAQ entries detected`);
  } else {
    score -= 8;
    reasons.push('No FAQ blocks — LLMs cite Q/A content disproportionately');
  }

  if (hasSchemaType(extraction.schemas, 'FAQPage')) {
    score += 14;
    reasons.push('FAQPage JSON-LD present');
  }

  if (extraction.tables.length > 0) {
    score += 10;
    reasons.push(`${extraction.tables.length} structured tables found`);
  }

  if (extraction.authors.length > 0) {
    score += 8;
    reasons.push(`Author signals present (${extraction.authors.length})`);
  } else {
    score -= 10;
    reasons.push('No author/byline signals — reduces citation trust');
  }

  const numericChunks = extraction.chunks.filter((c) => c.hasNumbers).length;
  if (numericChunks > 2) {
    score += 6;
    reasons.push('Numeric facts present — increases citation desirability');
  }

  return { score: clamp(score), reasons };
}

function scoreSemanticClarity(ctx: ScoringContext): DimensionScore {
  let score = 50;
  const reasons: string[] = [];
  const h1 = ctx.extraction.headings.filter((h) => h.level === 1).length;
  const h2 = ctx.extraction.headings.filter((h) => h.level === 2).length;
  const h3 = ctx.extraction.headings.filter((h) => h.level === 3).length;

  if (h1 === 1) {
    score += 14;
    reasons.push('Single canonical H1 present');
  } else if (h1 === 0) {
    score -= 15;
    reasons.push('Missing H1 — top-level topic is ambiguous to LLMs');
  } else {
    score -= 8;
    reasons.push(`Multiple H1s (${h1}) confuse topical hierarchy`);
  }

  if (h2 >= 2) {
    score += 12;
    reasons.push(`Healthy H2 structure (${h2} sections)`);
  } else if (h2 === 0) {
    score -= 12;
    reasons.push('No H2 sections — content lacks discoverable structure');
  }

  if (h3 >= 1) {
    score += 6;
    reasons.push('Sub-sections (H3+) improve LLM chunking');
  }

  if (ctx.extraction.metadata.title && ctx.extraction.metadata.title.length > 15) {
    score += 8;
    reasons.push('Descriptive <title> present');
  } else {
    score -= 6;
    reasons.push('Title is missing or too short');
  }

  return { score: clamp(score), reasons };
}

function scoreEntityClarity(ctx: ScoringContext): DimensionScore {
  let score = 45;
  const reasons: string[] = [];
  const ents = ctx.extraction.entities;

  if (ents.length >= 8) {
    score += 18;
    reasons.push(`${ents.length} distinct entities detected`);
  } else if (ents.length < 3) {
    score -= 18;
    reasons.push('Few named entities — page topic is ambiguous');
  }

  const highRelevance = ents.filter((e) => e.relevance >= 0.7).length;
  if (highRelevance >= 3) {
    score += 12;
    reasons.push(`${highRelevance} high-relevance entities`);
  }

  const orgOrProduct = ents.filter((e) => e.kind === 'organization' || e.kind === 'product').length;
  if (orgOrProduct > 0) {
    score += 8;
    reasons.push('Organization/product entities increase citability');
  }

  if (hasSchemaType(ctx.extraction.schemas, 'Organization') || hasSchemaType(ctx.extraction.schemas, 'Product')) {
    score += 10;
    reasons.push('Schema.org Organization/Product markup reinforces entities');
  } else {
    score -= 5;
    reasons.push('No Organization/Product JSON-LD');
  }

  return { score: clamp(score), reasons };
}

function scoreAnswerExtraction(ctx: ScoringContext): DimensionScore {
  let score = 40;
  const reasons: string[] = [];
  const { chunks } = ctx.extraction;
  const answerFirst = chunks.filter((c) => c.hasAnswerFirstSentence).length;

  if (chunks.length === 0) {
    return { score: 0, reasons: ['No semantic chunks extracted'] };
  }

  const ratio = answerFirst / chunks.length;
  if (ratio > 0.4) {
    score += 22;
    reasons.push(`${Math.round(ratio * 100)}% of chunks lead with an answer-first sentence`);
  } else if (ratio < 0.15) {
    score -= 15;
    reasons.push('Few chunks lead with direct answers — LLMs prefer answer-first writing');
  }

  if (ctx.extraction.faqs.length >= 3) {
    score += 14;
    reasons.push('Multiple FAQ entries (direct answers)');
  }

  const headedChunks = chunks.filter((c) => c.heading).length;
  if (headedChunks / chunks.length > 0.6) {
    score += 10;
    reasons.push('Most chunks have explicit headings');
  }

  return { score: clamp(score), reasons };
}

function scoreChunkOptimization(ctx: ScoringContext): DimensionScore {
  let score = 50;
  const reasons: string[] = [];
  const chunks = ctx.extraction.chunks;
  if (chunks.length === 0) return { score: 0, reasons: ['No content chunks found'] };

  const avgWords = chunks.reduce((s, c) => s + c.wordCount, 0) / chunks.length;
  if (avgWords > 60 && avgWords < 250) {
    score += 18;
    reasons.push(`Healthy chunk size (avg ${avgWords.toFixed(0)} words)`);
  } else if (avgWords <= 60) {
    score -= 10;
    reasons.push('Chunks too short — fragments AI summarization');
  } else {
    score -= 14;
    reasons.push('Chunks too long — exceed LLM context preferences');
  }

  const withList = chunks.filter((c) => c.hasList).length;
  if (withList >= 2) {
    score += 10;
    reasons.push('Lists present — easy for LLMs to extract bullets');
  }

  if (chunks.length >= 6) {
    score += 8;
    reasons.push(`${chunks.length} discrete chunks support multi-question answering`);
  }

  return { score: clamp(score), reasons };
}

function scoreSummarizationQuality(ctx: ScoringContext): DimensionScore {
  let score = 50;
  const reasons: string[] = [];
  const { extraction } = ctx;

  if (extraction.metadata.description && extraction.metadata.description.length > 70) {
    score += 16;
    reasons.push('Meta description present and descriptive');
  } else {
    score -= 12;
    reasons.push('Meta description missing or too short');
  }

  if (extraction.metadata.ogDescription) {
    score += 6;
    reasons.push('OpenGraph description present');
  }

  const firstChunk = extraction.chunks[0];
  if (firstChunk && firstChunk.wordCount > 40 && firstChunk.hasAnswerFirstSentence) {
    score += 14;
    reasons.push('Lead paragraph reads as a summary');
  } else if (firstChunk && firstChunk.wordCount < 30) {
    score -= 10;
    reasons.push('Lead paragraph is thin — summarization will be weak');
  }

  if (extraction.faqs.length >= 2) {
    score += 8;
    reasons.push('FAQs provide multi-perspective summary content');
  }

  return { score: clamp(score), reasons };
}

function scoreTrustSignals(ctx: ScoringContext): DimensionScore {
  let score = 45;
  const reasons: string[] = [];
  const { extraction } = ctx;

  if (extraction.authors.length > 0) {
    score += 18;
    reasons.push(`Authorship attributed (${extraction.authors.length} signals)`);
  } else {
    score -= 14;
    reasons.push('No author attribution — weakens E-E-A-T');
  }

  if (hasSchemaType(extraction.schemas, 'Organization')) {
    score += 10;
    reasons.push('Organization schema present');
  }

  if (hasSchemaType(extraction.schemas, 'Article') || hasSchemaType(extraction.schemas, 'NewsArticle')) {
    score += 10;
    reasons.push('Article/NewsArticle schema enhances trust');
  }

  const externalLinks = extraction.links.filter((l) => !l.isInternal).length;
  if (externalLinks > 2) {
    score += 6;
    reasons.push(`${externalLinks} external citations — supports E-E-A-T`);
  } else if (externalLinks === 0) {
    score -= 6;
    reasons.push('No external citations — trust signals are limited');
  }

  return { score: clamp(score), reasons };
}

function scoreStructuredContent(ctx: ScoringContext): DimensionScore {
  let score = 35;
  const reasons: string[] = [];
  const types = new Set(ctx.extraction.schemas.map((s) => s.type));

  if (types.size === 0) {
    return { score: 20, reasons: ['No JSON-LD schema markup found'] };
  }

  score += Math.min(40, types.size * 8);
  reasons.push(`${types.size} distinct schema types: ${[...types].slice(0, 6).join(', ')}`);

  if (types.has('FAQPage')) {
    score += 8;
    reasons.push('FAQPage — direct AI citation pathway');
  }
  if (types.has('Product')) {
    score += 8;
    reasons.push('Product schema');
  }
  if (types.has('Article') || types.has('NewsArticle')) {
    score += 6;
    reasons.push('Article schema');
  }
  if (types.has('BreadcrumbList')) {
    score += 4;
    reasons.push('BreadcrumbList aids hierarchical understanding');
  }

  return { score: clamp(score), reasons };
}

function scoreCrawlerFriendliness(robots: RobotsInfo, ctx: ScoringContext): DimensionScore {
  let score = 60;
  const reasons: string[] = [];

  if (robots.fetched) {
    if (robots.allowed) {
      score += 12;
      reasons.push('robots.txt allows GEO crawler');
    } else {
      score -= 35;
      reasons.push('robots.txt disallows access — AI crawlers will be blocked');
    }
    if (robots.sitemaps.length > 0) {
      score += 12;
      reasons.push(`Sitemap declared (${robots.sitemaps.length})`);
    }
  } else {
    score -= 8;
    reasons.push('No robots.txt — defaults are permissive but undocumented');
  }

  if (ctx.rootPage.hydrationDelta && ctx.rootPage.hydrationDelta.addedTextChars > 800) {
    score -= 20;
    reasons.push('Heavy JS hydration — non-JS AI crawlers miss content');
  }

  // llms.txt presence is checked separately when optimization fetches the page.
  return { score: clamp(score), reasons };
}

// ---------- Aggregation ----------

type PageDimension = Exclude<Dimension, 'crawlerFriendliness'>;

const PAGE_DIMENSION_SCORERS: Record<PageDimension, (ctx: ScoringContext) => DimensionScore> = {
  aiReadability: scoreAiReadability,
  citationFriendliness: scoreCitationFriendliness,
  semanticClarity: scoreSemanticClarity,
  entityClarity: scoreEntityClarity,
  answerExtraction: scoreAnswerExtraction,
  chunkOptimization: scoreChunkOptimization,
  summarizationQuality: scoreSummarizationQuality,
  trustSignals: scoreTrustSignals,
  structuredContent: scoreStructuredContent,
};

function aggregateDimensionScores(
  rootUrl: string,
  perPage: Array<{ url: string; score: DimensionScore }>,
): DimensionScore {
  if (perPage.length === 1) return perPage[0].score;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const { url, score } of perPage) {
    const w = url === rootUrl ? 2 : 1;
    weightedSum += score.score * w;
    totalWeight += w;
  }

  const sorted = [...perPage].sort((a, b) => a.score.score - b.score.score);
  const reasons: string[] = [`Aggregated across ${perPage.length} audited pages (homepage weighted 2×)`];
  for (const { url, score } of sorted.slice(0, 4)) {
    const hint = pathHint(url);
    for (const r of score.reasons.slice(0, 2)) {
      reasons.push(`${hint}: ${r}`);
    }
  }

  return { score: clamp(weightedSum / totalWeight), reasons: reasons.slice(0, 10) };
}

function scoreDimensions(ctx: ScoringContext): Record<Dimension, DimensionScore> {
  const pages = ctx.pageExtractions;
  const rootUrl = ctx.rootPage.finalUrl || ctx.url;

  if (pages && pages.length > 1) {
    const dimensions = {} as Record<Dimension, DimensionScore>;
    dimensions.crawlerFriendliness = scoreCrawlerFriendliness(ctx.crawl.robots, ctx);

    for (const dim of DIMENSIONS) {
      if (dim === 'crawlerFriendliness') continue;
      const scorer = PAGE_DIMENSION_SCORERS[dim];
      const perPage = pages.map(({ page, extraction }) => {
        const subCtx: ScoringContext = { ...ctx, rootPage: page, extraction };
        return { url: page.finalUrl || page.url, score: scorer(subCtx) };
      });
      dimensions[dim] = aggregateDimensionScores(rootUrl, perPage);
    }
    return dimensions;
  }

  return {
    aiReadability: scoreAiReadability(ctx),
    citationFriendliness: scoreCitationFriendliness(ctx),
    semanticClarity: scoreSemanticClarity(ctx),
    entityClarity: scoreEntityClarity(ctx),
    answerExtraction: scoreAnswerExtraction(ctx),
    chunkOptimization: scoreChunkOptimization(ctx),
    summarizationQuality: scoreSummarizationQuality(ctx),
    trustSignals: scoreTrustSignals(ctx),
    structuredContent: scoreStructuredContent(ctx),
    crawlerFriendliness: scoreCrawlerFriendliness(ctx.crawl.robots, ctx),
  };
}

export interface ScoreAllOptions {
  citationVisibility?: number | null;
  simulationRunCount?: number;
  calibration?: CalibrationWeights;
}

export function scoreAll(
  ctx: ScoringContext,
  options: ScoreAllOptions = {},
): {
  dimensions: Record<Dimension, DimensionScore>;
  overallScore: number;
  scoringMeta: ScoringMeta;
} {
  const dimensions = scoreDimensions(ctx);

  const { overallScore, scoringMeta } = computeHierarchicalScore({
    dimensions,
    citationVisibility: options.citationVisibility,
    simulationRunCount: options.simulationRunCount,
    layerWeightMultipliers: options.calibration?.layerMultipliers,
  });

  return { dimensions, overallScore, scoringMeta };
}

// ---------- Issue + Fix derivation ----------

function pageUrl(ctx: ScoringContext): string {
  return ctx.rootPage.finalUrl || ctx.url;
}

function crawledUrls(ctx: ScoringContext): string[] {
  const urls = new Set<string>();
  const site = ctx.url;
  urls.add(canonicalPageUrl(pageUrl(ctx), site));
  for (const p of ctx.crawl.pages) {
    const u = p.finalUrl || p.url;
    if (u) urls.add(canonicalPageUrl(u, site));
  }
  if (ctx.pageExtractions) {
    for (const { page } of ctx.pageExtractions) {
      urls.add(canonicalPageUrl(page.finalUrl || page.url, site));
    }
  }
  return [...urls];
}


function robotsTxtUrl(site: string): string | null {
  try {
    return new URL('/robots.txt', site).href;
  } catch {
    return null;
  }
}

function llmsTxtUrl(site: string): string | null {
  try {
    return new URL('/llms.txt', site).href;
  } catch {
    return null;
  }
}

const DIMENSION_RECOMMENDATIONS: Partial<Record<Dimension, string>> = Object.fromEntries(
  (['aiReadability', 'citationFriendliness', 'semanticClarity', 'entityClarity', 'answerExtraction', 'chunkOptimization', 'summarizationQuality', 'trustSignals', 'structuredContent', 'crawlerFriendliness'] as Dimension[]).map(
    (dim) => [dim, plainDimensionRecommendation(dim)],
  ),
) as Partial<Record<Dimension, string>>;

/** Returns only the pages that actually fail this dimension's checks. */
function affectedPagesForDimension(dim: Dimension, ctx: ScoringContext): string[] {
  const pages = ctx.pageExtractions ?? [{ page: ctx.rootPage, extraction: ctx.extraction }];
  const affected = new Set<string>();

  for (const { page, extraction } of pages) {
    const u = canonicalPageUrl(page.finalUrl || page.url, ctx.url);

    switch (dim) {
      case 'aiReadability': {
        const text = extraction.chunks.map((c) => c.text).join(' ');
        const words = text.split(/\s+/).filter(Boolean).length;
        const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
        const avgLen = sentences.length ? words / sentences.length : 0;
        const jsHeavy = page.hydrationDelta && page.hydrationDelta.addedTextChars > 500;
        if (words < 120 || avgLen >= 35 || !extraction.metadata.language || jsHeavy) affected.add(u);
        break;
      }
      case 'citationFriendliness':
        if (extraction.faqs.length === 0 || extraction.authors.length === 0) affected.add(u);
        break;
      case 'semanticClarity': {
        const h1 = extraction.headings.filter((h) => h.level === 1).length;
        const h2 = extraction.headings.filter((h) => h.level === 2).length;
        if (h1 !== 1 || h2 < 2) affected.add(u);
        break;
      }
      case 'entityClarity': {
        const hasSchema = extraction.schemas.some(
          (s) => s.type === 'Organization' || s.type === 'Product',
        );
        if (extraction.entities.length < 3 || !hasSchema) affected.add(u);
        break;
      }
      case 'answerExtraction': {
        const bad = extraction.chunks.filter((c) => !c.hasAnswerFirstSentence).length;
        if (bad > 0) affected.add(u);
        break;
      }
      case 'chunkOptimization': {
        const avg =
          extraction.chunks.length
            ? extraction.chunks.reduce((s, c) => s + c.wordCount, 0) / extraction.chunks.length
            : 0;
        if (avg <= 60 || avg > 250) affected.add(u);
        break;
      }
      case 'summarizationQuality': {
        const shortDesc =
          !extraction.metadata.description || extraction.metadata.description.length < 70;
        const thinLead = extraction.chunks[0] && extraction.chunks[0].wordCount < 30;
        if (shortDesc || thinLead) affected.add(u);
        break;
      }
      case 'trustSignals':
        if (extraction.authors.length === 0) affected.add(u);
        break;
      case 'structuredContent':
        if (extraction.schemas.length === 0) affected.add(u);
        break;
      case 'crawlerFriendliness':
        affected.add(u);
        break;
    }
  }

  return [...affected];
}

function buildIssueDetails(
  dim: Dimension,
  ds: DimensionScore,
  ctx: ScoringContext,
  focusReason?: string,
  canonicalId?: string,
): Issue['details'] {
  const site = canonicalPageUrl(pageUrl(ctx), ctx.url);
  const urls = new Set<string>([site]);
  const locations: string[] = [];

  for (const u of affectedPagesForDimension(dim, ctx)) urls.add(u);

  const impactedPages = buildImpactedPages(dim, ctx);
  for (const p of impactedPages) urls.add(p.url);

  switch (dim) {
    case 'crawlerFriendliness': {
      const robots = robotsTxtUrl(site);
      if (robots) urls.add(robots);
      for (const sm of ctx.crawl.robots.sitemaps) urls.add(sm);
      const llms = llmsTxtUrl(site);
      if (llms) urls.add(llms);
      break;
    }
    default:
      for (const p of impactedPages) {
        for (const h of p.highlights) {
          if (h.kind === 'chunk') {
            locations.push(`${p.pathHint ?? p.url}: ${h.label}`);
          }
        }
      }
      break;
  }

  const reasons = focusReason
    ? [
        focusReason,
        ...ds.reasons.filter((r) => r !== focusReason && isNegativeReason(r)).slice(0, 2),
      ]
    : ds.reasons.filter(isNegativeReason).length > 0
      ? ds.reasons.filter(isNegativeReason)
      : ds.reasons;

  return {
    affectedUrls: [...urls].slice(0, 30),
    reasons,
    recommendation: plainIssueRecommendation(canonicalId, dim),
    locations: locations.length > 0 ? locations.slice(0, 15) : undefined,
    impactedPages: impactedPages.length > 0 ? impactedPages : undefined,
  };
}

export function deriveIssuesAndFixes(
  dimensions: Record<Dimension, DimensionScore>,
  ctx?: ScoringContext,
  scoringMeta?: ScoringMeta | null,
): {
  issues: Issue[];
  fixes: Fix[];
} {
  const issues: Issue[] = [];
  const fixes: Fix[] = [];

  const bottleneckLayer = scoringMeta?.bottleneck.layer;
  const bottleneckDim = scoringMeta?.bottleneck.dimension;
  const pipelinePrefix = bottleneckLayer
    ? `Blocked by ${bottleneckLayer} layer: `
    : '';

  type Candidate = { dim: Dimension; reason: string; score: number };
  const buckets = new Map<string, { canonical: CanonicalIssueCategory | null; candidates: Candidate[] }>();

  const sortedDimensions = [...DIMENSIONS].sort((a, b) => {
    const aBottleneck =
      a === bottleneckDim ? 0 : DIMENSION_LAYERS[a] === bottleneckLayer ? 1 : 2;
    const bBottleneck =
      b === bottleneckDim ? 0 : DIMENSION_LAYERS[b] === bottleneckLayer ? 1 : 2;
    if (aBottleneck !== bBottleneck) return aBottleneck - bBottleneck;
    return dimensions[a].score - dimensions[b].score;
  });

  for (const dim of sortedDimensions) {
    const ds = dimensions[dim];
    if (ds.score >= 75) continue;
    const negativeReasons = ds.reasons.filter(isNegativeReason);
    const reasonsToEmit =
      negativeReasons.length > 0 ? negativeReasons : ds.reasons[0] ? [ds.reasons[0]] : [];

    for (const reason of reasonsToEmit) {
      const canonical = canonicalCategoryForReason(reason);
      const bucketId = canonical?.id ?? canonicalIssueId(reason, dim);
      const existing = buckets.get(bucketId);
      if (existing) {
        existing.candidates.push({ dim, reason, score: ds.score });
      } else {
        buckets.set(bucketId, { canonical, candidates: [{ dim, reason, score: ds.score }] });
      }
    }
  }

  for (const [bucketId, { canonical, candidates }] of buckets) {
    const primaryDim = canonical?.primaryDimension ?? candidates[0].dim;
    const primaryScore = dimensions[primaryDim].score;
    const worstScore = Math.min(...candidates.map((c) => c.score));
    const severity: Issue['severity'] =
      worstScore < 35 ? 'critical' : worstScore < 55 ? 'high' : 'medium';

    const lead =
      candidates.find((c) => c.dim === primaryDim) ??
      candidates.sort((a, b) => a.score - b.score)[0];
    const normalizedReasons = [
      ...new Set(
        candidates
          .map((c) => normalizeReasonText(c.reason))
          .filter((r) => r.length > 0 && !/^aggregated across/i.test(r)),
      ),
    ];
    const displayTitle = canonical?.title ?? lead.reason;
    const summaryReason = normalizedReasons[0] ?? normalizeReasonText(lead.reason);

    const baseDetails = ctx
      ? buildIssueDetails(primaryDim, dimensions[primaryDim], ctx, lead.reason, bucketId)
      : undefined;

    const isBottleneck =
      primaryDim === bottleneckDim || DIMENSION_LAYERS[primaryDim] === bottleneckLayer;
    const description = isBottleneck && pipelinePrefix
      ? `${pipelinePrefix}${expandReason(summaryReason)}`
      : expandReason(summaryReason);

    issues.push({
      id: `issue-${bucketId}`,
      issueKey: buildIssueKey(primaryDim, canonical?.id ?? summaryReason),
      severity,
      title: displayTitle,
      description,
      dimension: primaryDim,
      impact: plainImpact(primaryDim, Math.min(primaryScore, worstScore)),
      summaryPlain: plainIssueSummary(primaryDim, summaryReason, Math.min(primaryScore, worstScore)),
      details: baseDetails
        ? {
            ...baseDetails,
            reasons:
              normalizedReasons.length > 0
                ? normalizedReasons
                : baseDetails.reasons,
          }
        : undefined,
    });
  }

  const dimsBelow = Object.entries(dimensions)
    .filter(([, d]) => d.score < 75)
    .map(([d]) => d as Dimension);

  if (dimsBelow.includes('citationFriendliness') || dimsBelow.includes('answerExtraction')) {
    fixes.push({
      id: 'fix-faq-schema',
      title: 'Generate FAQPage JSON-LD',
      description: 'Add FAQPage schema with the page’s most natural Q/A pairs to make the content directly citable.',
      effort: 'low',
      dimension: 'citationFriendliness',
      artifactType: 'faq-schema',
    });
  }
  if (dimsBelow.includes('crawlerFriendliness') || dimsBelow.includes('structuredContent')) {
    fixes.push({
      id: 'fix-llms-txt',
      title: 'Publish an llms.txt manifest',
      description: 'Publish /llms.txt summarizing the site for AI crawlers (Anthropic spec).',
      effort: 'low',
      dimension: 'crawlerFriendliness',
      artifactType: 'llms-txt',
    });
  }
  if (dimsBelow.includes('summarizationQuality') || dimsBelow.includes('answerExtraction')) {
    fixes.push({
      id: 'fix-ai-summary',
      title: 'Add an "AI Summary" block to each key page',
      description: 'Add a 2–3 sentence summary at the top of each page; LLMs heavily favor such blocks.',
      effort: 'medium',
      dimension: 'summarizationQuality',
      artifactType: 'ai-summary',
    });
  }
  if (dimsBelow.includes('answerExtraction')) {
    fixes.push({
      id: 'fix-answer-first',
      title: 'Rewrite lead paragraphs in answer-first form',
      description: 'Place the direct answer in the first sentence of every section.',
      effort: 'medium',
      dimension: 'answerExtraction',
      artifactType: 'answer-first',
    });
  }
  if (dimsBelow.includes('structuredContent')) {
    fixes.push({
      id: 'fix-product-schema',
      title: 'Add Product / Organization JSON-LD',
      description: 'Add Product or Organization schema to expose your brand and offerings to AI search.',
      effort: 'low',
      dimension: 'structuredContent',
      artifactType: 'product-schema',
    });
  }

  issues.sort((a, b) => {
    const aPri =
      a.dimension === bottleneckDim ? 0 : DIMENSION_LAYERS[a.dimension] === bottleneckLayer ? 1 : 2;
    const bPri =
      b.dimension === bottleneckDim ? 0 : DIMENSION_LAYERS[b.dimension] === bottleneckLayer ? 1 : 2;
    if (aPri !== bPri) return aPri - bPri;
    const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return sev[a.severity] - sev[b.severity];
  });

  return { issues, fixes: fixes.slice(0, 6) };
}

export function getDimensionRecommendation(dim: Dimension): string | undefined {
  return DIMENSION_RECOMMENDATIONS[dim];
}
