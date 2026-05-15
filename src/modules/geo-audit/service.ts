/**
 * GEO Audit service — orchestrates the full Phase-1 pipeline.
 *
 * Pipeline:
 *   1. Create GeoAudit row (status="running")
 *   2. Crawl with Playwright (modules/crawling)
 *   3. Extract structured representation (modules/extraction)
 *   4. Score across 10 dimensions (./scoring)
 *   5. Derive issues + fixes
 *   6. Generate LLM narrative
 *   7. Persist results + return
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import {
  canonicalPageUrl,
  canonicalSiteUrlFromGoal,
  extractWebsiteFromText,
  isPlausibleWebsiteUrl,
  normalizeWebsiteUrl,
  sameTargetSite,
} from '@/lib/website-url';
import { logger } from '@shared/logger';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { crawlingService } from '@modules/crawling';
import { discoverInternalLinks } from '@modules/crawling';
import { extractionService } from '@modules/extraction';
import { embeddingsService } from '@modules/embeddings';
import { scoreAll, deriveIssuesAndFixes, type PageExtractionInput } from './scoring';
import { buildPageInventory } from './page-inventory';
import { NARRATIVE_SYSTEM, buildNarrativePrompt } from './prompts/narrative';
import {
  DIMENSION_LABELS,
  type Dimension,
  type DimensionScore,
  type GeoAuditResult,
  type Issue,
  type Fix,
  type PageInventory,
} from './schemas';
import type { LinkInfo } from '@modules/extraction';

/** Pages rendered + extracted per audit (capped for Playwright runtime). */
const AUDIT_MAX_PAGES = Math.min(config.crawl.maxPages, 5);

const auditLogger = logger.child({ module: 'geo-audit' });

const NarrativeResponseSchema = z.object({ narrative: z.string() });

export interface RunAuditInput {
  url: string;
  /** When the agent goal is a bare domain, pass it here to override truncated step URLs. */
  goalHint?: string;
  onProgress?: (progress: number, message: string) => void;
}

export async function runAudit(input: RunAuditInput): Promise<GeoAuditResult> {
  let normalizedUrl =
    (input.goalHint ? canonicalSiteUrlFromGoal(input.goalHint, input.url) : null) ??
    normalizeWebsiteUrl(input.url);

  if (!isPlausibleWebsiteUrl(normalizedUrl)) {
    const fromGoal = input.goalHint ? extractWebsiteFromText(input.goalHint) : null;
    if (fromGoal && isPlausibleWebsiteUrl(fromGoal)) {
      normalizedUrl = fromGoal;
    } else {
      throw new Error(
        `Website URL looks truncated (${normalizedUrl}). Use the full domain, e.g. https://www.mdhome.com.au`,
      );
    }
  }

  auditLogger.info({ url: normalizedUrl, goalHint: input.goalHint ?? null }, 'audit starting');

  // Ensure Site row exists
  const site = await prisma.site.upsert({
    where: { url: normalizedUrl },
    create: { url: normalizedUrl },
    update: {},
  });

  // Create audit row
  const audit = await prisma.geoAudit.create({
    data: {
      siteId: site.id,
      url: normalizedUrl,
      overallScore: 0,
      dimensions: '{}',
      topIssues: '[]',
      topFixes: '[]',
      status: 'running',
    },
  });

  try {
    input.onProgress?.(10, 'Crawling site…');
    let crawl = await crawlingService.crawl({
      url: normalizedUrl,
      auditId: audit.id,
      maxPages: AUDIT_MAX_PAGES,
      screenshot: true,
      onProgress: (p, m) => input.onProgress?.(10 + Math.round((p / 100) * 40), m),
    });

    const firstPage = crawl.pages[0];
    const unusable = crawl.pages.length === 0 || !firstPage?.renderedHtml;
    if (unusable && config.crawl.respectRobots) {
      auditLogger.warn(
        { url: normalizedUrl, robotsAllowed: crawl.robots.allowed, pageError: firstPage?.error },
        'crawl unusable with respectRobots=true; retrying once with respectRobots=false',
      );
      crawl = await crawlingService.crawl({
        url: normalizedUrl,
        auditId: audit.id,
        maxPages: AUDIT_MAX_PAGES,
        screenshot: true,
        respectRobots: false,
        onProgress: (p, m) => input.onProgress?.(10 + Math.round((p / 100) * 40), m),
      });
    }

    const fp = crawl.pages[0];
    if (crawl.pages.length === 0) {
      const reason =
        crawl.robots.fetched && !crawl.robots.allowed
          ? 'robots.txt disallows this URL for our crawler. Set CRAWL_RESPECT_ROBOTS=false in .env for local demos, or allow our user agent in robots.txt.'
          : 'No HTML pages were returned (network, DNS, or empty response).';
      throw new Error(reason);
    }
    if (!fp?.renderedHtml) {
      throw new Error(
        `Playwright did not return rendered HTML (${fp?.error ?? 'unknown'}). Install browsers: npx playwright install chromium`,
      );
    }

    // Persist crawl results
    for (const page of crawl.pages) {
      await prisma.crawlResult.create({
        data: {
          auditId: audit.id,
          url: page.url,
          statusCode: page.statusCode,
          html: page.html?.slice(0, 200_000),
          renderedHtml: page.renderedHtml?.slice(0, 400_000),
          screenshotPath: page.screenshotPath,
          contentType: page.contentType,
          durationMs: page.durationMs,
          error: page.error,
        },
      });
    }

    const rootPage = crawl.pages[0];
    const internalLinks =
      rootPage.renderedHtml != null
        ? discoverInternalLinks(rootPage.renderedHtml, normalizedUrl, 80)
        : [];

    const pageExtractions: PageExtractionInput[] = [];
    const auditedUrls = new Set<string>();
    const pagesToExtract = crawl.pages.filter((p) => p.renderedHtml);

    input.onProgress?.(50, `Extracting ${pagesToExtract.length} page(s)…`);
    for (let i = 0; i < pagesToExtract.length; i++) {
      const page = pagesToExtract[i];
      const pageUrl = canonicalPageUrl(page.finalUrl || page.url, normalizedUrl);
      input.onProgress?.(
        50 + Math.round(((i + 1) / pagesToExtract.length) * 25),
        `Extracting ${pageUrl}`,
      );

      const extraction = await extractionService.extractPage({
        url: pageUrl,
        html: page.renderedHtml!,
      });

      await prisma.extractionResult.create({
        data: {
          auditId: audit.id,
          url: pageUrl,
          metadata: stringifyJson(extraction.metadata),
          headings: stringifyJson(extraction.headings),
          schemas: stringifyJson(extraction.schemas),
          faqs: stringifyJson(extraction.faqs),
          entities: stringifyJson(extraction.entities),
          chunks: stringifyJson(extraction.chunks),
          links: stringifyJson(extraction.links),
          tables: stringifyJson(extraction.tables),
          authors: stringifyJson(extraction.authors),
        },
      });

      auditedUrls.add(pageUrl);
      pageExtractions.push({ page, extraction });
    }

    const extraction = pageExtractions[0]?.extraction;
    if (!extraction) {
      throw new Error('No pages could be extracted for scoring.');
    }

    await embeddingsService.indexChunksForAudit(audit.id, extraction).catch((err) => {
      auditLogger.warn({ err: (err as Error).message, auditId: audit.id }, 'chunk embeddings skipped');
    });

    const pageInventory = buildPageInventory({
      rootUrl: normalizedUrl,
      crawl,
      internalLinks,
      auditedUrls,
    });

    input.onProgress?.(80, 'Scoring 10 dimensions…');
    const scoringCtx = {
      url: normalizedUrl,
      rootPage,
      extraction,
      crawl,
      pageExtractions: pageExtractions.length > 1 ? pageExtractions : undefined,
    };
    const { dimensions, overallScore } = scoreAll(scoringCtx);
    const { issues, fixes } = deriveIssuesAndFixes(dimensions, scoringCtx);

    input.onProgress?.(90, 'Generating narrative…');
    const narrative = await generateNarrative({ url: normalizedUrl, overallScore, dimensions });

    input.onProgress?.(97, 'Saving report…');
    await prisma.geoAudit.update({
      where: { id: audit.id },
      data: {
        overallScore,
        dimensions: stringifyJson(dimensions),
        narrative,
        topIssues: stringifyJson(issues),
        topFixes: stringifyJson(fixes),
        screenshotUrl: rootPage.screenshotPath,
        status: 'completed',
      },
    });

    // pageInventory is a column added after the initial schema; use raw SQL to
    // avoid failures when the Prisma client binary hasn't been regenerated yet.
    await prisma.$executeRawUnsafe(
      `UPDATE "GeoAudit" SET "pageInventory" = ? WHERE "id" = ?`,
      stringifyJson(pageInventory),
      audit.id,
    ).catch((err) => {
      auditLogger.warn({ err: (err as Error).message, auditId: audit.id }, 'pageInventory save skipped');
    });

    input.onProgress?.(100, 'Done!');
    auditLogger.info({ auditId: audit.id, overallScore }, 'audit complete');

    return {
      id: audit.id,
      url: normalizedUrl,
      overallScore,
      dimensions,
      narrative,
      topIssues: issues,
      topFixes: fixes,
      pageInventory,
      screenshotUrl: rootPage.screenshotPath,
      createdAt: audit.createdAt.toISOString(),
    };
  } catch (err) {
    auditLogger.error({ err, auditId: audit.id }, 'audit failed');
    await prisma.geoAudit.update({
      where: { id: audit.id },
      data: { status: 'failed', narrative: (err as Error).message },
    });
    throw err;
  }
}

async function generateNarrative(input: {
  url: string;
  overallScore: number;
  dimensions: Record<Dimension, DimensionScore>;
}): Promise<string> {
  try {
    const { data } = await ai.generateStructuredOutput({
      schema: NarrativeResponseSchema,
      system: NARRATIVE_SYSTEM,
      prompt: buildNarrativePrompt(input),
    });
    return data.narrative.trim();
  } catch (err) {
    auditLogger.warn({ err: (err as Error).message }, 'narrative generation failed');
    return `GEO score: ${input.overallScore}/100. Detailed analysis is available in the dimension breakdown below.`;
  }
}

export async function getAudit(auditId: string): Promise<GeoAuditResult | null> {
  const row = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: {
      id: true, url: true, overallScore: true, dimensions: true,
      narrative: true, topIssues: true, topFixes: true, screenshotUrl: true, createdAt: true,
    },
  });
  if (!row) return null;

  // Read pageInventory via raw SQL to tolerate a stale Prisma client binary.
  const rawInv = await prisma.$queryRawUnsafe<[{ pageInventory: string }?]>(
    `SELECT "pageInventory" FROM "GeoAudit" WHERE "id" = ?`,
    auditId,
  ).then((rows) => rows[0]?.pageInventory ?? null).catch(() => null);

  let pageInventory = parsePageInventory(rawInv);
  if (!pageInventory) {
    pageInventory = await getAuditPageInventoryFallback(auditId);
  }

  const rawIssues = parseJson<Issue[]>(row.topIssues, []);
  const topIssues = await enrichIssuesFromStoredPages(auditId, row.url, rawIssues, pageInventory);

  return {
    id: row.id,
    url: row.url,
    overallScore: row.overallScore,
    dimensions: parseJson(row.dimensions, {} as Record<Dimension, DimensionScore>),
    narrative: row.narrative,
    topIssues,
    topFixes: parseJson<Fix[]>(row.topFixes, []),
    pageInventory,
    screenshotUrl: row.screenshotUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * For older audits that were stored before multi-page scoring, fetch per-page extraction
 * data from the DB and re-derive per-issue affected URLs without re-running Playwright.
 * Issues that already have multi-page details are returned unchanged.
 */
async function enrichIssuesFromStoredPages(
  auditId: string,
  siteUrl: string,
  issues: Issue[],
  pageInventory?: PageInventory,
): Promise<Issue[]> {
  // If all issues already have details with more than just the root URL, skip re-enrichment.
  const rootCanon = canonicalPageUrl(siteUrl, siteUrl);
  const allHaveRealDetails = issues.every(
    (iss) =>
      iss.details &&
      iss.details.affectedUrls.length > 1 &&
      !iss.details.affectedUrls.every((u) => canonicalPageUrl(u, siteUrl) === rootCanon),
  );
  if (allHaveRealDetails) return issues;

  // Load per-page extractions from DB.
  const rows = await prisma.extractionResult.findMany({
    where: { auditId },
    select: { url: true, schemas: true, faqs: true, authors: true, headings: true, chunks: true, metadata: true },
  });
  if (rows.length === 0) return issues;

  // Build a lightweight per-page summary for per-dimension URL filtering.
  type PageSummary = {
    url: string;
    schemasLen: number;
    faqsLen: number;
    authorsLen: number;
    h1Count: number;
    h2Count: number;
    chunkAvgWords: number;
    chunkAnswerFirstRatio: number;
    descLen: number;
    firstChunkWords: number;
    entityCount: number;
  };

  const pageSummaries: PageSummary[] = rows.map((r) => {
    type H = { level: number };
    type C = { wordCount: number; hasAnswerFirstSentence: boolean };
    type M = { description?: string };
    const headings = parseJson<H[]>(r.headings, []);
    const chunks = parseJson<C[]>(r.chunks, []);
    const meta = parseJson<M>(r.metadata, {});
    const total = chunks.length || 1;
    return {
      url: canonicalPageUrl(r.url, siteUrl),
      schemasLen: parseJson<unknown[]>(r.schemas, []).length,
      faqsLen: parseJson<unknown[]>(r.faqs, []).length,
      authorsLen: parseJson<unknown[]>(r.authors, []).length,
      h1Count: headings.filter((h) => h.level === 1).length,
      h2Count: headings.filter((h) => h.level === 2).length,
      chunkAvgWords: chunks.reduce((s, c) => s + c.wordCount, 0) / total,
      chunkAnswerFirstRatio: chunks.filter((c) => c.hasAnswerFirstSentence).length / total,
      descLen: meta.description?.length ?? 0,
      firstChunkWords: chunks[0]?.wordCount ?? 0,
      entityCount: 0,
    };
  });

  const pagesForDim = (dim: Dimension): string[] => {
    return pageSummaries
      .filter((p) => {
        switch (dim) {
          case 'aiReadability':        return p.descLen < 70 || p.chunkAnswerFirstRatio < 0.15;
          case 'citationFriendliness': return p.faqsLen === 0 || p.authorsLen === 0;
          case 'semanticClarity':      return p.h1Count !== 1 || p.h2Count < 2;
          case 'entityClarity':        return p.schemasLen === 0;
          case 'answerExtraction':     return p.chunkAnswerFirstRatio < 0.15;
          case 'chunkOptimization':    return p.chunkAvgWords <= 60 || p.chunkAvgWords > 250;
          case 'summarizationQuality': return p.descLen < 70 || p.firstChunkWords < 30;
          case 'trustSignals':         return p.authorsLen === 0;
          case 'structuredContent':    return p.schemasLen === 0;
          case 'crawlerFriendliness':  return true;
          default:                     return false;
        }
      })
      .map((p) => p.url);
  };

  return issues.map((issue) => {
    const dim = issue.dimension;
    const affected = new Set<string>([rootCanon, ...pagesForDim(dim)]);
    const reasons = issue.details?.reasons ??
      (issue.description ? issue.description.split(' · ').filter(Boolean) : [issue.title]);

    return {
      ...issue,
      details: {
        affectedUrls: [...affected].slice(0, 30),
        reasons,
        recommendation: issue.details?.recommendation,
        locations: issue.details?.locations,
      },
    };
  });
}

function parsePageInventory(raw: string | null | undefined): PageInventory | undefined {
  const parsed = parseJson<PageInventory | null>(raw ?? '[]', null);
  if (parsed && parsed.pages?.length) return parsed;
  return undefined;
}

/** Fallback inventory from crawl rows when older audits lack pageInventory JSON. */
export async function getAuditPageInventoryFallback(auditId: string): Promise<PageInventory | undefined> {
  const rows = await prisma.crawlResult.findMany({
    where: { auditId },
    select: { url: true, statusCode: true, error: true },
  });
  if (rows.length === 0) return undefined;
  return {
    pages: rows.map((r) => ({
      url: r.url,
      statusCode: r.statusCode,
      source: 'seed' as const,
      audited: true,
      error: r.error,
    })),
    auditedCount: rows.length,
    discoveredCount: rows.length,
  };
}

export async function listRecentAudits(limit = 20): Promise<Array<{
  id: string;
  url: string;
  overallScore: number;
  status: string;
  createdAt: string;
}>> {
  const rows = await prisma.geoAudit.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, url: true, overallScore: true, status: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    overallScore: r.overallScore,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export const geoAuditService = {
  runAudit,
  getAudit,
  listRecentAudits,
};
