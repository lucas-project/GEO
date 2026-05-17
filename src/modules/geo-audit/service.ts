import 'server-only';

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
import { crawlingService, crawlSinglePage, fetchRobots, discoverSitemaps, fetchSitemap } from '@modules/crawling';
import { discoverInternalLinks } from '@modules/crawling';
import type { CrawledPage, CrawlResult } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { extractionService } from '@modules/extraction';
import { embeddingsService } from '@modules/embeddings';
import { ingestAuditSync } from '@modules/intelligence';
import { getLatestCitationVisibility } from '@modules/intelligence/citation-snapshot';
import { queue } from '@shared/queue';
import { getCalibrationWeights } from './calibration';
import { deriveScoringMetaFromDimensions } from './hierarchical-scoring';
import { scoreAll, deriveIssuesAndFixes, type PageExtractionInput } from './scoring';
import { buildImpactedPagesFromExtractionRow } from './issue-evidence';
import { attachRangesToHighlights } from './locate-in-source';
import type { SourceRange } from './schemas';
import { buildPageInventory } from './page-inventory';
import { NARRATIVE_SYSTEM, buildNarrativePrompt } from './prompts/narrative';
import {
  DIMENSION_LABELS,
  type Dimension,
  type DimensionScore,
  type GeoAuditResult,
  type ScoringMeta,
  type Issue,
  type Fix,
  type PageInventory,
  ScoringMetaSchema,
} from './schemas';
import type { LinkInfo } from '@modules/extraction';
import { groupAuditsBySite, type SiteAuditGroup } from './group-by-site';
import { plainIssueRecommendation } from './plain-language';

/** Pages rendered + extracted per audit (capped for Playwright runtime). */
const AUDIT_MAX_PAGES = Math.min(config.crawl.maxPages, 5);

const auditLogger = logger.child({ module: 'geo-audit' });

const NarrativeResponseSchema = z.object({ narrative: z.string() });

export interface RunAuditInput {
  url: string;
  /** When the agent goal is a bare domain, pass it here to override truncated step URLs. */
  goalHint?: string;
  /** Cap crawl depth (monitoring health-check uses fewer pages). */
  maxPages?: number;
  /** User-selected same-origin URLs to crawl (homepage always included). */
  pageUrls?: string[];
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
    const defaultMax = input.pageUrls?.length
      ? Math.max(input.pageUrls.length, AUDIT_MAX_PAGES)
      : AUDIT_MAX_PAGES;
    const maxPages = Math.min(input.maxPages ?? defaultMax, config.crawl.maxPages);
    let crawl = await crawlingService.crawl({
      url: normalizedUrl,
      auditId: audit.id,
      maxPages,
      pageUrls: input.pageUrls,
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
        maxPages,
        pageUrls: input.pageUrls,
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

    input.onProgress?.(80, 'Scoring AI visibility pipeline…');
    const scoringCtx = {
      url: normalizedUrl,
      rootPage,
      extraction,
      crawl,
      pageExtractions: pageExtractions.length > 1 ? pageExtractions : undefined,
    };
    const [citationVisibility, calibration, simulationRunCount] = await Promise.all([
      getLatestCitationVisibility(site.id),
      getCalibrationWeights(site.id),
      prisma.aiSimulation.count({ where: { siteId: site.id } }),
    ]);
    const { dimensions, overallScore, scoringMeta } = scoreAll(scoringCtx, {
      citationVisibility,
      simulationRunCount,
      calibration,
    });
    const { issues, fixes } = deriveIssuesAndFixes(dimensions, scoringCtx, scoringMeta);

    input.onProgress?.(90, 'Generating narrative…');
    const narrative = await generateNarrative({
      url: normalizedUrl,
      overallScore,
      dimensions,
      scoringMeta,
      siteId: site.id,
    });

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

    await prisma.$executeRawUnsafe(
      `UPDATE "GeoAudit" SET "scoringMeta" = ? WHERE "id" = ?`,
      stringifyJson(scoringMeta),
      audit.id,
    ).catch((err) => {
      auditLogger.warn({ err: (err as Error).message, auditId: audit.id }, 'scoringMeta save skipped');
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

    await ingestAuditSync(audit.id).catch((err) => {
      auditLogger.warn({ err: (err as Error).message, auditId: audit.id }, 'intelligence sync ingest skipped');
    });
    void queue.enqueue('intelligence.ingest', { auditId: audit.id, embeddingsOnly: true }).catch((err) => {
      auditLogger.warn({ err: (err as Error).message, auditId: audit.id }, 'intelligence embedding job skipped');
    });

    return {
      id: audit.id,
      siteId: site.id,
      url: normalizedUrl,
      overallScore,
      dimensions,
      scoringMeta,
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
  scoringMeta?: ScoringMeta;
  siteId?: string;
}): Promise<string> {
  try {
    const { data } = await ai.generateStructuredOutput({
      schema: NarrativeResponseSchema,
      system: NARRATIVE_SYSTEM,
      prompt: await buildNarrativePrompt(input),
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
      id: true,
      siteId: true,
      url: true,
      overallScore: true,
      dimensions: true,
      narrative: true,
      topIssues: true,
      topFixes: true,
      screenshotUrl: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  const rawCols = await prisma.$queryRawUnsafe<
    [{ pageInventory: string; scoringMeta: string }?]
  >(
    `SELECT "pageInventory", "scoringMeta" FROM "GeoAudit" WHERE "id" = ?`,
    auditId,
  ).then((rows) => rows[0] ?? null).catch(() => null);

  const rawInv = rawCols?.pageInventory ?? null;

  let pageInventory = parsePageInventory(rawInv);
  if (!pageInventory) {
    pageInventory = await getAuditPageInventoryFallback(auditId);
  }

  const dimensions = parseJson(row.dimensions, {} as Record<Dimension, DimensionScore>);
  const storedMeta = parseScoringMeta(rawCols?.scoringMeta ?? null);
  const scoringMeta =
    storedMeta ?? (Object.keys(dimensions).length > 0 ? deriveScoringMetaFromDimensions(dimensions) : null);
  const { issues: derivedIssues } = deriveIssuesAndFixes(dimensions, undefined, scoringMeta);
  const topIssues = await enrichIssuesFromStoredPages(
    auditId,
    row.url,
    derivedIssues,
    pageInventory,
  );

  return {
    id: row.id,
    siteId: row.siteId,
    url: row.url,
    overallScore: row.overallScore,
    dimensions,
    scoringMeta,
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
const PAGE_SOURCE_MAX_CHARS = 120_000;
const PAGE_SOURCE_WINDOW_PAD = 8_192;

async function collectRangesFromAuditIssues(
  auditId: string,
  pageUrl: string,
): Promise<SourceRange[]> {
  const audit = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { url: true, topIssues: true },
  });
  if (!audit) return [];

  const target = canonicalPageUrl(pageUrl, audit.url);
  const issues = parseJson<Issue[]>(audit.topIssues, []);
  const ranges: SourceRange[] = [];

  for (const issue of issues) {
    for (const page of issue.details?.impactedPages ?? []) {
      if (canonicalPageUrl(page.url, audit.url) !== target) continue;
      for (const h of page.highlights) {
        if (h.sourceRanges?.length) ranges.push(...h.sourceRanges);
      }
    }
  }

  return ranges;
}

export async function getAuditPageSource(
  auditId: string,
  pageUrl: string,
): Promise<{
  url: string;
  statusCode: number;
  html: string;
  offset: number;
  truncated: boolean;
  error: string | null;
} | null> {
  const audit = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { url: true },
  });
  if (!audit) return null;

  const target = canonicalPageUrl(pageUrl, audit.url);
  const rows = await prisma.crawlResult.findMany({
    where: { auditId },
    select: { url: true, statusCode: true, renderedHtml: true, html: true, error: true },
  });

  const row = rows.find((r) => canonicalPageUrl(r.url, audit.url) === target);
  if (!row) return null;

  const raw = row.renderedHtml ?? row.html ?? '';
  const ranges = await collectRangesFromAuditIssues(auditId, target);

  const rangeBeyondCap = ranges.some(
    (r) => r.start >= PAGE_SOURCE_MAX_CHARS || r.end > PAGE_SOURCE_MAX_CHARS,
  );
  const fileTooLarge = raw.length > PAGE_SOURCE_MAX_CHARS;

  if (ranges.length > 0 && (rangeBeyondCap || fileTooLarge)) {
    const minStart = Math.max(0, Math.min(...ranges.map((r) => r.start)) - PAGE_SOURCE_WINDOW_PAD);
    const maxEnd = Math.min(raw.length, Math.max(...ranges.map((r) => r.end)) + PAGE_SOURCE_WINDOW_PAD);
    return {
      url: target,
      statusCode: row.statusCode,
      html: raw.slice(minStart, maxEnd),
      offset: minStart,
      truncated: minStart > 0 || maxEnd < raw.length,
      error: row.error,
    };
  }

  const truncated = fileTooLarge;
  const html = truncated ? raw.slice(0, PAGE_SOURCE_MAX_CHARS) : raw;

  return {
    url: target,
    statusCode: row.statusCode,
    html,
    offset: 0,
    truncated,
    error: row.error,
  };
}

async function enrichIssuesFromStoredPages(
  auditId: string,
  siteUrl: string,
  issues: Issue[],
  _pageInventory?: PageInventory,
): Promise<Issue[]> {
  const rootCanon = canonicalPageUrl(siteUrl, siteUrl);
  const allEnriched = issues.every(
    (iss) =>
      iss.details?.impactedPages &&
      iss.details.impactedPages.length > 0 &&
      (iss.details.impactedPages.length > 1 ||
        iss.details.impactedPages[0]?.url !== rootCanon),
  );
  if (allEnriched) return issues;

  const rows = await prisma.extractionResult.findMany({
    where: { auditId },
    select: {
      url: true,
      schemas: true,
      faqs: true,
      authors: true,
      headings: true,
      chunks: true,
      metadata: true,
      entities: true,
    },
  });
  if (rows.length === 0) return issues;

  const crawlByUrl = new Map<string, string>();
  const crawlRows = await prisma.crawlResult.findMany({
    where: { auditId },
    select: { url: true, renderedHtml: true, html: true },
  });
  for (const c of crawlRows) {
    const key = canonicalPageUrl(c.url, siteUrl);
    crawlByUrl.set(key, c.renderedHtml ?? c.html ?? '');
  }

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
    const impactedPages = rows
      .map((r) => {
        const base = buildImpactedPagesFromExtractionRow(dim, siteUrl, r);
        if (!base) return null;
        const rendered = crawlByUrl.get(canonicalPageUrl(r.url, siteUrl));
        if (!rendered) return base;
        return {
          ...base,
          highlights: attachRangesToHighlights(base.highlights, rendered, dim),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const affected = new Set<string>([rootCanon, ...pagesForDim(dim)]);
    for (const p of impactedPages) affected.add(p.url);

    const reasons = issue.details?.reasons ??
      (issue.description ? issue.description.split(' · ').filter(Boolean) : [issue.title]);

    const locations =
      issue.details?.locations ??
      impactedPages.flatMap((p) =>
        p.highlights.filter((h) => h.kind === 'chunk').map((h) => `${p.pathHint}: ${h.label}`),
      ).slice(0, 15);

    return {
      ...issue,
      details: {
        affectedUrls: [...affected].slice(0, 30),
        reasons,
        recommendation:
          issue.details?.recommendation ??
          plainIssueRecommendation(issue.id.replace(/^issue-/, ''), dim),
        locations: locations.length > 0 ? locations : undefined,
        impactedPages: impactedPages.length > 0 ? impactedPages : issue.details?.impactedPages,
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
  citationProbability?: number;
  status: string;
  createdAt: string;
  siteId: string | null;
  monitored: boolean;
}>> {
  const rows = await prisma.geoAudit.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      url: true,
      overallScore: true,
      status: true,
      createdAt: true,
      siteId: true,
      site: { select: { monitored: true, monitorEnabled: true } },
    },
  });

  const metaById = new Map<string, number>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const metaRows = await prisma.$queryRawUnsafe<Array<{ id: string; scoringMeta: string }>>(
      `SELECT "id", "scoringMeta" FROM "GeoAudit" WHERE "id" IN (${placeholders})`,
      ...ids,
    ).catch(() => []);
    for (const m of metaRows) {
      const meta = parseScoringMeta(m.scoringMeta);
      if (meta) metaById.set(m.id, meta.citationProbability);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    overallScore: r.overallScore,
    citationProbability: metaById.get(r.id),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    siteId: r.siteId,
    monitored: Boolean(r.site?.monitored && r.site?.monitorEnabled),
  }));
}

/** Scan recent audits, group by site, return one page of site rows. */
const SITE_GROUP_AUDIT_SCAN = 500;

export async function listRecentAuditSiteGroups(
  page: number,
  pageSize: number,
): Promise<{
  groups: SiteAuditGroup[];
  page: number;
  pageSize: number;
  totalSites: number;
  totalPages: number;
  hasMore: boolean;
}> {
  const audits = await listRecentAudits(SITE_GROUP_AUDIT_SCAN);
  const allGroups = groupAuditsBySite(
    audits.map(({ id, url, overallScore, citationProbability, status, createdAt, monitored }) => ({
      id,
      url,
      overallScore,
      citationProbability,
      status,
      createdAt,
      monitored,
    })),
  );

  const safePage = Math.max(0, Number.isFinite(page) ? page : 0);
  const safeSize = Math.min(Math.max(pageSize, 1), 50);
  const start = safePage * safeSize;
  const totalSites = allGroups.length;
  const totalPages = totalSites === 0 ? 0 : Math.ceil(totalSites / safeSize);

  return {
    groups: allGroups.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    totalSites,
    totalPages,
    hasMore: start + safeSize < totalSites,
  };
}

function extractionFromDbRow(row: {
  url: string;
  metadata: string;
  headings: string;
  schemas: string;
  faqs: string;
  entities: string;
  chunks: string;
  links: string;
  tables: string;
  authors: string;
}): PageExtraction {
  return {
    url: row.url,
    metadata: parseJson(row.metadata, {
      title: null,
      description: null,
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogType: null,
      twitterCard: null,
      language: null,
      charset: null,
      robots: null,
    }),
    headings: parseJson(row.headings, []),
    schemas: parseJson(row.schemas, []),
    faqs: parseJson(row.faqs, []),
    entities: parseJson(row.entities, []),
    chunks: parseJson(row.chunks, []),
    links: parseJson(row.links, []),
    tables: parseJson(row.tables, []),
    authors: parseJson(row.authors, []),
  };
}

/** Crawl and score additional pages on an existing audit. */
export async function extendAudit(
  auditId: string,
  pageUrls: string[],
  onProgress?: (progress: number, message: string) => void,
): Promise<GeoAuditResult> {
  const audit = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { id: true, siteId: true, url: true, status: true, screenshotUrl: true, createdAt: true },
  });
  if (!audit) throw new Error('Audit not found');
  if (audit.status !== 'completed') throw new Error('Audit is not complete');

  const normalizedUrl = audit.url;
  const existingRows = await prisma.crawlResult.findMany({
    where: { auditId },
    select: { url: true },
  });
  const auditedSet = new Set(
    existingRows.map((r) => canonicalPageUrl(r.url, normalizedUrl)),
  );

  const toCrawl = pageUrls
    .map((u) => canonicalPageUrl(u, normalizedUrl))
    .filter((u) => sameTargetSite(u, normalizedUrl) && !auditedSet.has(u));

  if (toCrawl.length === 0) {
    throw new Error('All selected pages were already audited');
  }

  onProgress?.(5, `Crawling ${toCrawl.length} new page(s)…`);
  let done = 0;
  for (const pageUrl of toCrawl) {
    const crawled = await crawlSinglePage(pageUrl, {
      timeoutMs: config.crawl.timeoutMs,
      screenshot: false,
      auditId,
    });

    await prisma.crawlResult.create({
      data: {
        auditId,
        url: pageUrl,
        statusCode: crawled.statusCode,
        html: crawled.html?.slice(0, 200_000),
        renderedHtml: crawled.renderedHtml?.slice(0, 400_000),
        screenshotPath: crawled.screenshotPath,
        contentType: crawled.contentType,
        durationMs: crawled.durationMs,
        error: crawled.error,
      },
    });

    if (crawled.renderedHtml) {
      const extraction = await extractionService.extractPage({
        url: canonicalPageUrl(crawled.finalUrl || pageUrl, normalizedUrl),
        html: crawled.renderedHtml,
      });

      await prisma.extractionResult.create({
        data: {
          auditId,
          url: canonicalPageUrl(crawled.finalUrl || pageUrl, normalizedUrl),
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
    }

    done++;
    onProgress?.(5 + Math.round((done / toCrawl.length) * 45), `Processed ${pageUrl}`);
  }

  onProgress?.(55, 'Re-scoring audit…');
  const crawlRows = await prisma.crawlResult.findMany({ where: { auditId } });
  const extractionRows = await prisma.extractionResult.findMany({ where: { auditId } });

  const pages: CrawledPage[] = crawlRows.map((r) => ({
    url: r.url,
    finalUrl: r.url,
    statusCode: r.statusCode,
    contentType: r.contentType,
    html: r.html,
    renderedHtml: r.renderedHtml,
    title: null,
    fetchedAt: new Date().toISOString(),
    durationMs: r.durationMs ?? 0,
    screenshotPath: r.screenshotPath,
    error: r.error,
    hydrationDelta: null,
  }));

  const rootCanon = canonicalPageUrl(normalizedUrl, normalizedUrl);
  const rootPage =
    pages.find((p) => canonicalPageUrl(p.finalUrl || p.url, normalizedUrl) === rootCanon) ?? pages[0];
  if (!rootPage?.renderedHtml) {
    throw new Error('Root page HTML missing; cannot re-score');
  }

  const pageExtractions: PageExtractionInput[] = [];
  for (const row of extractionRows) {
    const page =
      pages.find(
        (p) => canonicalPageUrl(p.url, normalizedUrl) === canonicalPageUrl(row.url, normalizedUrl),
      ) ?? rootPage;
    pageExtractions.push({ page, extraction: extractionFromDbRow(row) });
  }

  const robots = await fetchRobots(normalizedUrl);
  let sitemapUrls = robots.sitemaps;
  if (sitemapUrls.length === 0) sitemapUrls = await discoverSitemaps(normalizedUrl);
  const sitemap = [];
  for (const sm of sitemapUrls.slice(0, 3)) {
    sitemap.push(...(await fetchSitemap(sm, 50)));
  }

  const crawl: CrawlResult = {
    rootUrl: normalizedUrl,
    pages,
    robots,
    sitemap,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };

  const internalLinks =
    rootPage.renderedHtml != null
      ? discoverInternalLinks(rootPage.renderedHtml, normalizedUrl, 80)
      : [];

  const auditedUrls = new Set(
    extractionRows.map((r) => canonicalPageUrl(r.url, normalizedUrl)),
  );

  const pageInventory = buildPageInventory({
    rootUrl: normalizedUrl,
    crawl,
    internalLinks,
    auditedUrls,
  });

  const extraction = pageExtractions[0]!.extraction;
  const scoringCtx = {
    url: normalizedUrl,
    rootPage,
    extraction,
    crawl,
    pageExtractions: pageExtractions.length > 1 ? pageExtractions : undefined,
  };

  const siteId = audit.siteId;
  const [citationVisibility, calibration, simulationRunCount] = await Promise.all([
    siteId ? getLatestCitationVisibility(siteId) : Promise.resolve(null),
    getCalibrationWeights(siteId),
    siteId ? prisma.aiSimulation.count({ where: { siteId } }) : Promise.resolve(0),
  ]);
  const { dimensions, overallScore, scoringMeta } = scoreAll(scoringCtx, {
    citationVisibility,
    simulationRunCount,
    calibration,
  });
  const { issues, fixes } = deriveIssuesAndFixes(dimensions, scoringCtx, scoringMeta);

  onProgress?.(85, 'Updating narrative…');
  const narrative = await generateNarrative({
    url: normalizedUrl,
    overallScore,
    dimensions,
    scoringMeta,
    siteId: siteId ?? undefined,
  });

  await prisma.geoAudit.update({
    where: { id: auditId },
    data: {
      overallScore,
      dimensions: stringifyJson(dimensions),
      narrative,
      topIssues: stringifyJson(issues),
      topFixes: stringifyJson(fixes),
    },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "GeoAudit" SET "scoringMeta" = ? WHERE "id" = ?`,
    stringifyJson(scoringMeta),
    auditId,
  ).catch((err) => {
    auditLogger.warn({ err: (err as Error).message, auditId }, 'scoringMeta save skipped');
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "GeoAudit" SET "pageInventory" = ? WHERE "id" = ?`,
    stringifyJson(pageInventory),
    auditId,
  ).catch((err) => {
    auditLogger.warn({ err: (err as Error).message, auditId }, 'pageInventory save skipped');
  });

  onProgress?.(100, 'Done');
  await ingestAuditSync(auditId).catch(() => {});

  return {
    id: auditId,
    siteId: audit.siteId,
    url: normalizedUrl,
    overallScore,
    dimensions,
    scoringMeta,
    narrative,
    topIssues: issues,
    topFixes: fixes,
    pageInventory,
    screenshotUrl: audit.screenshotUrl,
    createdAt: audit.createdAt.toISOString(),
  };
}

function parseScoringMeta(json: string | null | undefined): ScoringMeta | null {
  if (!json || json === '{}') return null;
  const parsed = parseJson<unknown>(json, null);
  if (!parsed) return null;
  const result = ScoringMetaSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export const geoAuditService = {
  runAudit,
  extendAudit,
  getAudit,
  getAuditPageSource,
  listRecentAudits,
};
