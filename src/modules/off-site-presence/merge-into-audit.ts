import 'server-only';

import * as cheerio from 'cheerio';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { extractSchemas } from '@modules/extraction/extractors/schema';
import {
  DIMENSIONS,
  DimensionScoreSchema,
  ScoringMetaSchema,
  deriveScoringMetaFromDimensions,
  type Dimension,
  type DimensionScore,
  type ScoringMeta,
} from '@modules/geo-audit';
import { computeHierarchicalScore } from '@modules/geo-audit/hierarchical-scoring';
import { buildLayerEvidence } from '@modules/geo-audit/layer-evidence';
import type { CrawlResult } from '@modules/crawling';
import type { OffSitePresenceReport } from './schemas';
import {
  buildOffSiteDimensionScore,
  mapReportToPresenceProbe,
} from './map-to-scoring';

function normalizeDimensions(
  raw: Partial<Record<Dimension, DimensionScore>>,
): Record<Dimension, DimensionScore> {
  const out = {} as Record<Dimension, DimensionScore>;
  for (const d of DIMENSIONS) {
    const parsed = DimensionScoreSchema.safeParse(raw[d]);
    out[d] = parsed.success ? parsed.data : { score: 0, reasons: [] };
  }
  return out;
}

function parseScoringMeta(json: string | null | undefined): ScoringMeta | null {
  if (!json) return null;
  try {
    const parsed = ScoringMetaSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function emptyCrawl(rootUrl: string): CrawlResult {
  const now = new Date().toISOString();
  return {
    rootUrl,
    pages: [],
    robots: {
      fetched: false,
      allowed: true,
      sitemaps: [],
      crawlDelayMs: null,
      rawSize: 0,
    },
    sitemap: [],
    startedAt: now,
    finishedAt: now,
  };
}

export async function mergeOffSiteReportIntoAudit(
  auditId: string,
  report: OffSitePresenceReport,
): Promise<void> {
  const row = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { url: true, dimensions: true, scoringMeta: true },
  });
  if (!row) return;

  const dimensions = normalizeDimensions(
    parseJson(row.dimensions, {} as Partial<Record<Dimension, DimensionScore>>),
  );
  dimensions.offSitePresence = buildOffSiteDimensionScore(report);

  const storedMeta = parseScoringMeta(row.scoringMeta) ?? deriveScoringMetaFromDimensions(dimensions);
  const presenceProbe = mapReportToPresenceProbe(report);

  const { overallScore, scoringMeta: recomputed } = computeHierarchicalScore({
    dimensions,
    citationVisibility: storedMeta.citationSnapshotVisibility ?? null,
    simulationRunCount: storedMeta.simulationRunCount,
    presenceSignals: storedMeta.presenceSignals,
  });

  const mergedMeta: ScoringMeta = {
    ...storedMeta,
    ...recomputed,
    presenceSignals: storedMeta.presenceSignals,
    checklist: storedMeta.checklist,
    refCategories: storedMeta.refCategories,
    auxiliaryScores: storedMeta.auxiliaryScores,
    shareOfModel: storedMeta.shareOfModel,
    presenceProbe,
    platformWeights: storedMeta.platformWeights,
    offSitePresenceReport: report,
    offSitePresenceScannedAt: report.meta.scannedAt,
  };

  if (storedMeta.layerEvidence) {
    mergedMeta.layerEvidence = {
      ...storedMeta.layerEvidence,
      presence: buildLayerEvidence({
        dimensions,
        gatesApplied: mergedMeta.gatesApplied,
        crawl: emptyCrawl(row.url),
        rootUrl: row.url,
        presenceSignals: storedMeta.presenceSignals,
        presenceProbe,
        offSitePresenceReport: report,
        siteChecklist: storedMeta.checklist,
        citationSnapshotVisibility: storedMeta.citationSnapshotVisibility,
        shareOfModel: storedMeta.shareOfModel,
      }).presence,
    };
  }

  await prisma.geoAudit.update({
    where: { id: auditId },
    data: {
      overallScore,
      dimensions: stringifyJson(dimensions),
      scoringMeta: stringifyJson(mergedMeta),
    },
  });
}

export async function loadAuditEntityPages(
  auditId: string,
): Promise<import('./resolve-entity').EntityPageInput[]> {
  const rows = await prisma.crawlResult.findMany({
    where: { auditId },
    select: { url: true, renderedHtml: true, html: true },
    take: 8,
  });

  const pages: import('./resolve-entity').EntityPageInput[] = [];
  for (const row of rows) {
    const html = row.renderedHtml ?? row.html ?? '';
    if (!html || html.length < 200) continue;
    const $ = cheerio.load(html);
    pages.push({
      url: row.url,
      html,
      schemas: extractSchemas($),
    });
  }
  return pages;
}
