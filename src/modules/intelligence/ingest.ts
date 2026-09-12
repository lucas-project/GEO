/**
 * Ingest audit results into intelligence rollups and pattern stats.
 */

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { config } from '@shared/config';
import { getEmbeddingsAI } from '@shared/ai';
import type { DimensionScore, Issue, ScoringMeta } from '@modules/geo-audit';
import { DIMENSIONS, ScoringMetaSchema } from '@modules/geo-audit';
import {
  extractRollupSignals,
  parseExtractionRow,
  listPatternsFromSignals,
  signalTagsFromRollup,
  legacyFieldsFromSignals,
} from './rollup';
import { buildIssueKey } from './issue-key';
import { ingestCitationSnapshot } from './citation-snapshot';
import { buildCohortKeys, reindexComparativePatterns, type RollupRecord } from './cohort-analytics';
import type { PatternType } from './schemas';

const ingestLogger = logger.child({ module: 'intelligence-ingest' });

export function getMinCohortSamples(): number {
  return config.intelligence.minCohortSamples;
}

/** Scale minimum pattern samples down when the cohort is still small. */
export function getEffectiveMinCohortSamples(rollupCount: number): number {
  const configured = config.intelligence.minCohortSamples;
  if (rollupCount <= 0) return configured;
  if (rollupCount >= configured) return configured;
  return Math.max(3, Math.ceil(rollupCount * 0.4));
}

export function cohortKeys(vertical: string | null | undefined, opts?: {
  overallScore?: number;
  platformHits?: string[];
}): string[] {
  const record: RollupRecord = {
    siteId: '',
    auditId: '',
    overallScore: opts?.overallScore ?? 0,
    vertical: vertical ?? null,
    signalsJson: '{}',
    citationVisibility: null,
    platformHits: opts?.platformHits ?? [],
  };
  return buildCohortKeys(record);
}

function parseScoringMetaJson(json: string | null | undefined): ScoringMeta | null {
  if (!json || json === '{}') return null;
  const parsed = parseJson<unknown>(json, null);
  if (!parsed) return null;
  const result = ScoringMetaSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function dimensionScoresMap(dimensionsJson: string): Record<string, number> {
  const dims = parseJson<Record<string, DimensionScore>>(dimensionsJson, {});
  const out: Record<string, number> = {};
  for (const d of DIMENSIONS) {
    out[d] = dims[d]?.score ?? 0;
  }
  return out;
}

async function recordPattern(
  cohortKey: string,
  patternType: PatternType,
  patternKey: string,
  overallScore: number,
): Promise<void> {
  const existing = await prisma.patternStat.findUnique({
    where: {
      cohortKey_patternType_patternKey: { cohortKey, patternType, patternKey },
    },
  });

  if (existing) {
    const n = existing.sampleCount + 1;
    const avg = (existing.avgOverallScore * existing.sampleCount + overallScore) / n;
    await prisma.patternStat.update({
      where: { id: existing.id },
      data: {
        sampleCount: n,
        avgOverallScore: avg,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.patternStat.create({
      data: {
        cohortKey,
        patternType,
        patternKey,
        sampleCount: 1,
        avgOverallScore: overallScore,
        p50Score: overallScore,
        metadata: '{}',
      },
    });
  }
}

async function recordPatternsForAudit(
  cohorts: string[],
  patterns: ReturnType<typeof listPatternsFromSignals>,
  overallScore: number,
): Promise<void> {
  for (const cohortKey of cohorts) {
    for (const { patternType, patternKey } of patterns) {
      await recordPattern(cohortKey, patternType, patternKey, overallScore);
    }
  }
}

/** Fast path: rollups, issues, pattern stats (no embedding API calls). */
export async function ingestAuditSync(auditId: string): Promise<void> {
  const started = Date.now();
  const audit = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    include: { extractionResults: true, site: true },
  });
  if (!audit || audit.status !== 'completed' || !audit.siteId) return;

  const extractions = audit.extractionResults.map(parseExtractionRow);
  const dimScores = dimensionScoresMap(audit.dimensions);
  const signals = extractRollupSignals(extractions, dimScores);

  const scoringMetaJson = await prisma.$queryRawUnsafe<[{ scoringMeta: string }?]>(
    `SELECT "scoringMeta" FROM "GeoAudit" WHERE "id" = ?`,
    auditId,
  ).then((rows) => rows[0]?.scoringMeta ?? null).catch(() => null);
  const scoringMeta = parseScoringMetaJson(scoringMetaJson);
  if (scoringMeta) {
    signals.pipeline = {
      citationProbability: scoringMeta.citationProbability,
      bottleneckLayer: scoringMeta.bottleneck.layer,
      bottleneckDimension: scoringMeta.bottleneck.dimension,
      layerScores: Object.fromEntries(
        Object.entries(scoringMeta.layers).map(([k, v]) => [k, v.effectiveScore]),
      ),
    };
  }

  const legacy = legacyFieldsFromSignals(signals);
  const vertical = audit.site?.vertical ?? null;

  const citation = await ingestCitationSnapshot(audit.siteId, auditId);
  const patterns = listPatternsFromSignals(signals, {
    targetVisibilityScore: citation?.targetVisibilityScore ?? null,
  });

  await prisma.auditRollup.upsert({
    where: { auditId },
    create: {
      siteId: audit.siteId,
      auditId,
      overallScore: audit.overallScore,
      dimensionScores: stringifyJson(dimScores),
      schemaTypes: stringifyJson(legacy.schemaTypes),
      faqCount: legacy.faqCount,
      chunkCount: legacy.chunkCount,
      answerFirstRatio: legacy.answerFirstRatio,
      signals: stringifyJson(signals),
      vertical,
    },
    update: {
      overallScore: audit.overallScore,
      dimensionScores: stringifyJson(dimScores),
      schemaTypes: stringifyJson(legacy.schemaTypes),
      faqCount: legacy.faqCount,
      chunkCount: legacy.chunkCount,
      answerFirstRatio: legacy.answerFirstRatio,
      signals: stringifyJson(signals),
      vertical,
    },
  });

  const issues = parseJson<Issue[]>(audit.topIssues, []);
  await prisma.issueOccurrence.deleteMany({ where: { auditId } });
  for (const issue of issues) {
    const issueKey = issue.issueKey ?? buildIssueKey(issue.dimension, issue.title);
    await prisma.issueOccurrence.create({
      data: {
        auditId,
        siteId: audit.siteId,
        issueKey,
        severity: issue.severity,
        dimension: issue.dimension,
      },
    });
  }

  const cohorts = cohortKeys(vertical, {
    overallScore: audit.overallScore,
    platformHits: citation?.platformHits,
  });
  await recordPatternsForAudit(cohorts, patterns, audit.overallScore);

  const rollupCount = await prisma.auditRollup.count();
  if (rollupCount >= 3) {
    try {
      const { patternsUpdated } = await reindexComparativePatterns();
      ingestLogger.info({ rollupCount, patternsUpdated }, 'cohort comparative patterns reindexed');
    } catch (err) {
      ingestLogger.warn(
        { err: (err as Error).message, auditId },
        'cohort reindex after ingest failed',
      );
    }
  }

  ingestLogger.info(
    { auditId, siteId: audit.siteId, durationMs: Date.now() - started },
    'audit sync ingest complete',
  );
}

/** Slow path: cohort embeddings for high-scoring or high-visibility audits. */
export async function ingestAuditEmbeddings(auditId: string): Promise<void> {
  const started = Date.now();
  const audit = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    include: { extractionResults: true, site: true },
  });
  if (!audit || audit.status !== 'completed' || !audit.siteId) return;

  const scoreThreshold = config.intelligence.highScoreEmbeddingThreshold;
  const citationThreshold = config.intelligence.citationEmbedVisibilityThreshold;

  const latestSnap = await prisma.citationSnapshot.findFirst({
    where: { siteId: audit.siteId },
    orderBy: { createdAt: 'desc' },
  });
  const citationVisibility = latestSnap?.targetVisibilityScore ?? 0;

  const scoreOk = audit.overallScore >= scoreThreshold;
  const citationOk = citationVisibility >= citationThreshold;
  if (!scoreOk && !citationOk) {
    ingestLogger.debug(
      { auditId, score: audit.overallScore, citationVisibility },
      'skipping embeddings below thresholds',
    );
    return;
  }

  const extractions = audit.extractionResults.map(parseExtractionRow);
  const dimScores = dimensionScoresMap(audit.dimensions);
  const signals = extractRollupSignals(extractions, dimScores);
  const tags = signalTagsFromRollup(signals);
  const vertical = audit.site?.vertical ?? null;
  const cohorts = cohortKeys(vertical, {
    overallScore: audit.overallScore,
    platformHits: [],
  });

  const dimensionHint =
    citationOk && !scoreOk
      ? 'citationFriendliness'
      : dimScores.aiReadability >= dimScores.semanticClarity
        ? 'aiReadability'
        : 'semanticClarity';

  const max = Math.min(6, config.embeddings.maxChunksPerAudit);
  const chunks = extractions.flatMap((e) => e.chunks).slice(0, max);
  if (chunks.length === 0) return;

  let embedded = 0;
  for (const cohortKey of cohorts) {
    await prisma.patternEmbedding.deleteMany({ where: { auditId, cohortKey } });
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i].text.slice(0, 4000);
      try {
        const { vector, model } = await getEmbeddingsAI().generateEmbedding({ text });
        await prisma.patternEmbedding.create({
          data: {
            siteId: audit.siteId,
            cohortKey,
            auditId,
            chunkIndex: i,
            textPreview: text.slice(0, 500),
            overallScore: audit.overallScore,
            dimensions: vector.length,
            vector: stringifyJson(vector),
            model,
            signalTags: stringifyJson(tags),
            dimensionHint,
            industry: vertical,
          },
        });
        embedded++;
      } catch (err) {
        ingestLogger.warn({ err: (err as Error).message, auditId }, 'pattern embedding skipped');
      }
    }
  }

  ingestLogger.info(
    { auditId, embedded, durationMs: Date.now() - started },
    'audit embedding ingest complete',
  );
}

/** Full ingest (sync + embeddings) — used by backfill scripts. */
export async function ingestAudit(auditId: string): Promise<void> {
  await ingestAuditSync(auditId);
  await ingestAuditEmbeddings(auditId);
}

/** Backfill rollups + patterns for all completed audits. */
export async function backfillIntelligenceFromAudits(opts?: {
  reindexEmbeddings?: boolean;
}): Promise<{ processed: number; skipped: number; citations: number }> {
  const started = Date.now();
  const audits = await prisma.geoAudit.findMany({
    where: { status: 'completed', siteId: { not: null } },
    select: { id: true, siteId: true },
    orderBy: { createdAt: 'asc' },
  });

  let processed = 0;
  const skipped = 0;
  const siteIds = new Set<string>();

  for (const a of audits) {
    await ingestAuditSync(a.id);
    if (opts?.reindexEmbeddings) await ingestAuditEmbeddings(a.id);
    if (a.siteId) siteIds.add(a.siteId);
    processed++;
  }

  let citations = 0;
  for (const siteId of siteIds) {
    const snap = await ingestCitationSnapshot(siteId);
    if (snap) citations++;
  }

  let patternsUpdated = 0;
  if (processed >= 3) {
    try {
      const r = await reindexComparativePatterns();
      patternsUpdated = r.patternsUpdated;
    } catch (err) {
      ingestLogger.warn({ err: (err as Error).message }, 'cohort reindex after backfill failed');
    }
  }

  ingestLogger.info(
    { processed, skipped, citations, patternsUpdated, durationMs: Date.now() - started },
    'intelligence backfill complete',
  );
  return { processed, skipped, citations };
}

/** Recompute all PatternStat rows with comparative lift metadata. */
export async function reindexPatterns(): Promise<{ patternsUpdated: number }> {
  return reindexComparativePatterns();
}

export { ingestCitationSnapshot, reindexComparativePatterns };
