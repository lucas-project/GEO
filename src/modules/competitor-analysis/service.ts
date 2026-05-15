/**
 * Competitor Analysis service — Phase 2b.
 *
 * Runs a Phase-1 audit on the target + each competitor, then computes
 * dimension gaps, entity/schema coverage diffs.
 */

import { randomId } from '@shared/util/id';
import { prisma, stringifyJson, parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { runAudit } from '@modules/geo-audit';
import { type DimensionScore, DIMENSIONS } from '@modules/geo-audit';
import type { SiteSummary, CompetitorComparison, DimensionGap } from './schemas';

const compLogger = logger.child({ module: 'competitor-analysis' });

export interface RunComparisonInput {
  targetUrl: string;
  competitorUrls: string[];
  onProgress?: (progress: number, message: string) => void;
}

async function auditAsSummary(url: string): Promise<SiteSummary> {
  const result = await runAudit({ url });
  const audit = await prisma.geoAudit.findUnique({
    where: { id: result.id },
    include: { extractionResults: true },
  });
  const extraction = audit?.extractionResults[0];
  const entities = extraction
    ? safeParse<Array<{ name: string; kind: string; relevance: number }>>(extraction.entities, [])
    : [];
  const schemas = extraction
    ? safeParse<Array<{ type: string }>>(extraction.schemas, [])
    : [];
  const faqs = extraction ? safeParse<unknown[]>(extraction.faqs, []) : [];
  const authors = extraction ? safeParse<unknown[]>(extraction.authors, []) : [];

  return {
    url: result.url,
    auditId: result.id,
    overallScore: result.overallScore,
    dimensions: result.dimensions as Record<string, DimensionScore>,
    entities: entities.slice(0, 25),
    schemaTypes: [...new Set(schemas.map((s) => s.type))],
    faqCount: faqs.length,
    authorCount: authors.length,
  };
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function computeGap(target: SiteSummary, competitor: SiteSummary): CompetitorComparison['gaps'][number] {
  const dimensionGaps: DimensionGap[] = [];
  for (const dim of DIMENSIONS) {
    const t = target.dimensions[dim]?.score ?? 0;
    const c = competitor.dimensions[dim]?.score ?? 0;
    dimensionGaps.push({ dimension: dim, target: t, competitor: c, gap: t - c });
  }

  const targetEntities = new Set(target.entities.map((e) => e.name.toLowerCase()));
  const compEntities = new Set(competitor.entities.map((e) => e.name.toLowerCase()));
  const entitiesAhead = target.entities
    .filter((e) => !compEntities.has(e.name.toLowerCase()))
    .map((e) => e.name)
    .slice(0, 15);
  const entitiesBehind = competitor.entities
    .filter((e) => !targetEntities.has(e.name.toLowerCase()))
    .map((e) => e.name)
    .slice(0, 15);

  const targetSchemas = new Set(target.schemaTypes);
  const compSchemas = new Set(competitor.schemaTypes);
  const schemaAhead = [...targetSchemas].filter((t) => !compSchemas.has(t));
  const schemaBehind = [...compSchemas].filter((t) => !targetSchemas.has(t));

  return {
    competitorUrl: competitor.url,
    overallGap: target.overallScore - competitor.overallScore,
    dimensionGaps,
    entitiesAhead,
    entitiesBehind,
    schemaAhead,
    schemaBehind,
  };
}

export async function runComparison(input: RunComparisonInput): Promise<CompetitorComparison> {
  const id = randomId();
  const targetUrl = normalizeWebsiteUrl(input.targetUrl.trim());
  const competitorUrls = input.competitorUrls.map((u) => normalizeWebsiteUrl(u.trim()));
  compLogger.info({ id, targetUrl, competitorCount: competitorUrls.length }, 'comparison starting');

  input.onProgress?.(5, `Auditing target ${targetUrl}…`);
  const target = await auditAsSummary(targetUrl);

  const competitors: SiteSummary[] = [];
  const step = 90 / Math.max(1, competitorUrls.length);
  for (let i = 0; i < competitorUrls.length; i++) {
    const url = competitorUrls[i];
    input.onProgress?.(10 + Math.round(step * i), `Auditing competitor ${url}…`);
    competitors.push(await auditAsSummary(url));
  }

  const gaps = competitors.map((c) => computeGap(target, c));

  const out: CompetitorComparison = {
    id,
    target,
    competitors,
    gaps,
    createdAt: new Date().toISOString(),
  };

  // Persist per-competitor rows (reports, other features) + full run for UI
  const targetSite = await prisma.site.findUnique({ where: { url: target.url } });
  for (const gap of gaps) {
    await prisma.competitorReport.create({
      data: {
        siteId: targetSite?.id,
        targetUrl: target.url,
        competitorUrl: gap.competitorUrl,
        diff: stringifyJson(gap),
      },
    });
  }

  await prisma.comparisonRun.create({
    data: {
      id,
      targetUrl: target.url,
      payload: stringifyJson(out),
    },
  });

  return out;
}

export async function listRecentComparisons(limit = 20): Promise<
  Array<{
    id: string;
    targetUrl: string;
    competitorUrls: string[];
    createdAt: string;
  }>
> {
  const rows = await prisma.comparisonRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, targetUrl: true, payload: true, createdAt: true },
  });
  return rows.flatMap((r) => {
    const full = parseJson<CompetitorComparison | null>(r.payload, null);
    if (!full?.competitors) return [];
    return [
      {
        id: r.id,
        targetUrl: r.targetUrl,
        competitorUrls: full.competitors.map((c) => c.url),
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

export async function getComparisonRun(id: string): Promise<CompetitorComparison | null> {
  const row = await prisma.comparisonRun.findUnique({ where: { id } });
  if (!row) return null;
  const data = parseJson<CompetitorComparison | null>(row.payload, null);
  return data && Array.isArray(data.gaps) && data.target ? data : null;
}

export async function getLatestCompetitorGapsForTarget(
  targetUrl: string,
  limit = 8,
): Promise<Array<{ id: string; competitorUrl: string; gap: unknown | null; createdAt: string }>> {
  const rows = await prisma.competitorReport.findMany({
    where: { targetUrl },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    competitorUrl: r.competitorUrl,
    gap: safeParse(r.diff, null as unknown | null),
    createdAt: r.createdAt.toISOString(),
  }));
}

export const competitorAnalysisService = {
  runComparison,
  listRecentComparisons,
  getComparisonRun,
  getLatestCompetitorGapsForTarget,
};
