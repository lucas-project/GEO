/**
 * Optimization service — Phase 3 entry point.
 *
 * Generates a specific artifact for a given audit. Reads the audit's
 * crawl + extraction results from the DB and dispatches to the right
 * generator.
 */

import { randomId } from '@shared/util/id';
import { prisma, parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import type { CrawlResult } from '@modules/crawling';
import { generateFaqSchema } from './generators/faq-schema';
import { generateLlmsTxt } from './generators/llms-txt';
import { generateAiSummary } from './generators/ai-summary';
import { generateAnswerFirst } from './generators/answer-first';
import { generateProductSchema } from './generators/product-schema';
import { type GeneratedArtifact, type ArtifactType } from './schemas';
import { pickAdapter } from './cms';
import type { CmsPatchResult } from './cms';
import { recordFixApplied } from '@modules/intelligence';
import { DIMENSIONS, selectAuditRootPage, type DimensionScore } from '@modules/geo-audit';

const optLogger = logger.child({ module: 'optimization' });

export interface GenerateInput {
  auditId: string;
  type: ArtifactType;
  targetUrl?: string;
}

export async function generateArtifact(input: GenerateInput): Promise<GeneratedArtifact> {
  const audit = await prisma.geoAudit.findUnique({
    where: { id: input.auditId },
    include: { extractionResults: true, crawlResults: true },
  });
  if (!audit) throw new Error(`audit ${input.auditId} not found`);

  const targetUrl = input.targetUrl ?? audit.url;
  const extraction = input.targetUrl
    ? audit.extractionResults.find(page => page.url.replace(/\/$/, '') === targetUrl.replace(/\/$/, ''))
    : selectAuditRootPage(audit.extractionResults, targetUrl);
  if (!extraction) throw new Error('no extraction available for audit');

  const { parseExtractionRow } = await import('@modules/intelligence/rollup');
  const ext = parseExtractionRow(extraction);

  const sourceEvidence = parseJson<{ evidenceBundle?: { evidence: Array<{ id: string; finalUrl: string; requestedUrl: string }> } }>(audit.scoringMeta, {});
  const evidenceIds = sourceEvidence.evidenceBundle?.evidence.filter(e => e.finalUrl === targetUrl || e.requestedUrl === targetUrl).map(e => e.id) ?? [];
  let content = '';
  let rationale = '';
  let format: GeneratedArtifact['contentFormat'] = 'text';

  optLogger.info({ type: input.type, auditId: input.auditId }, 'generating artifact');

  switch (input.type) {
    case 'faq-schema': {
      const bodyText = ext.chunks.map((c) => c.text).join('\n\n').slice(0, 6000);
      const out = await generateFaqSchema({
        title: ext.metadata.title ?? audit.url,
        url: audit.url,
        bodyText,
        existingFaqs: ext.faqs,
        siteId: audit.siteId,
      });
      content = out.jsonLd ? `<script type="application/ld+json">\n${out.jsonLd}\n</script>` : '';
      rationale = out.rationale;
      format = 'html';
      break;
    }
    case 'llms-txt': {
      const crawledPageUrls = audit.crawlResults.map((r) => r.url);
      const crawl: CrawlResult = {
        rootUrl: audit.url,
        pages: [],
        robots: { fetched: false, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
        sitemap: crawledPageUrls.map((loc) => ({ loc })),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      const out = generateLlmsTxt({
        siteName: ext.metadata.title ?? new URL(audit.url).hostname,
        siteUrl: audit.url,
        description: ext.metadata.description ?? '',
        crawl,
        extraction: ext,
        crawledPageUrls,
      });
      content = out.content;
      rationale = out.rationale;
      format = 'markdown';
      break;
    }
    case 'ai-summary': {
      const bodyText = ext.chunks.map((c) => c.text).join('\n\n').slice(0, 4000);
      const out = await generateAiSummary({
        title: ext.metadata.title ?? audit.url,
        bodyText,
      });
      content = out.htmlBlock;
      rationale = out.rationale;
      format = 'html';
      break;
    }
    case 'answer-first': {
      const firstChunk = ext.chunks[0]?.text ?? '';
      if (!firstChunk) {
        content = '';
        rationale = 'No first chunk available to rewrite.';
        format = 'text';
      } else {
        const out = await generateAnswerFirst({
          title: ext.metadata.title ?? audit.url,
          firstChunk,
        });
        content = out.rewritten;
        rationale = out.rationale;
        format = 'text';
      }
      break;
    }
    case 'product-schema': {
      const out = generateProductSchema({
        url: audit.url,
        siteName: ext.metadata.title ?? new URL(audit.url).hostname,
        extraction: ext,
      });
      content = `<script type="application/ld+json">\n${out.jsonLd}\n</script>`;
      rationale = out.rationale;
      format = 'html';
      break;
    }
    case 'metadata': {
      const metaParts: string[] = [];
      const desc = ext.metadata.description ?? '';
      if (!desc || desc.length < 70) {
        const firstChunk = ext.chunks[0]?.text ?? '';
        metaParts.push(
          `<meta name="description" content="${firstChunk.slice(0, 150).replace(/"/g, '&quot;')}">`,
        );
      }
      if (!ext.metadata.ogTitle && ext.metadata.title) {
        metaParts.push(`<meta property="og:title" content="${ext.metadata.title.replace(/"/g, '&quot;')}">`);
      }
      if (!ext.metadata.canonical) {
        metaParts.push(`<link rel="canonical" href="${audit.url}">`);
      }
      content = metaParts.join('\n');
      rationale = 'Adds missing meta description, og:title, and canonical to improve summarization signals.';
      format = 'html';
      break;
    }
  }

  const row = await prisma.optimizationSuggestion.create({
    data: {
      id: randomId(),
      auditId: input.auditId,
      type: input.type,
      targetUrl,
      evidenceIds: JSON.stringify(evidenceIds),
      sourceRevision: audit.revision,
      contentFormat: format,
      disposition: content ? 'draft' : 'insufficient_evidence',
      generatedContent: content,
      rationale,
      applied: false,
    },
  });

  return {
    id: row.id,
    auditId: row.auditId,
    type: input.type,
    targetUrl: row.targetUrl,
    content,
    contentFormat: format,
    rationale,
    applied: false,
    evidenceIds,
    disposition: row.disposition,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listArtifactsForAudit(auditId: string): Promise<GeneratedArtifact[]> {
  const rows = await prisma.optimizationSuggestion.findMany({
    where: { auditId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    auditId: r.auditId,
    type: r.type as ArtifactType,
    targetUrl: r.targetUrl,
    content: r.generatedContent,
    contentFormat: r.contentFormat as GeneratedArtifact['contentFormat'],
    rationale: r.rationale ?? '',
    applied: r.applied,
    evidenceIds: parseJson<string[]>(r.evidenceIds, []),
    disposition: r.disposition,
    recheckAuditId: r.recheckAuditId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function applyArtifactToWordpress(
  auditId: string,
  artifactType: ArtifactType,
  content: string,
): Promise<CmsPatchResult> {
  const audit = await prisma.geoAudit.findUnique({ where: { id: auditId } });
  if (!audit) throw new Error(`audit ${auditId} not found`);
  const adapter = pickAdapter(audit.url);
  if (!adapter) {
    return {
      applied: false,
      message:
        'No CMS adapter matched. Set WORDPRESS_BASE_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD and ensure the audit URL hostname matches the WordPress site.',
    };
  }
  return adapter.applyPatch({ url: audit.url, artifactType, content });
}

export async function markOptimizationApplied(optimizationId: string): Promise<void> {
  const row = await prisma.optimizationSuggestion.findUnique({
    where: { id: optimizationId },
    include: { audit: true },
  });
  if (!row || row.applied) return;

  await prisma.optimizationSuggestion.update({
    where: { id: optimizationId },
    data: { applied: true, disposition: 'applied' },
  });

  const audit = row.audit;
  if (!audit?.siteId) return;

  const dims = parseJson<Record<string, DimensionScore>>(audit.dimensions, {});
  const dimScores: Record<string, number> = {};
  for (const d of DIMENSIONS) {
    dimScores[d] = dims[d]?.score ?? 0;
  }

  const issueKey = `${row.type}:applied`;
  await recordFixApplied({
    siteId: audit.siteId,
    optimizationId,
    issueKey,
    artifactType: row.type,
    scoreBefore: audit.overallScore,
    dimensionBefore: dimScores,
  });

  optLogger.info({ optimizationId, siteId: audit.siteId }, 'optimization marked applied');
}

export const optimizationService = {
  generateArtifact,
  listArtifactsForAudit,
  applyArtifactToWordpress,
  markOptimizationApplied,
};
