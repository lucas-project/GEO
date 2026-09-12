/**
 * Intelligence queries — benchmarks, playbooks, trends, cohort RAG.
 */

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { getEmbeddingsAI } from '@shared/ai';
import type { DimensionScore } from '@modules/geo-audit';
import type {
  BenchmarkInsight,
  PlaybookEntry,
  SiteTrend,
  PatternStatMetadata,
  InsightKind,
} from './schemas';
import { PatternStatMetadataSchema } from './schemas';
import { getEffectiveMinCohortSamples, getMinCohortSamples } from './ingest';
import { parseRollupSignals, listPatternsFromSignals } from './rollup';
import { getLatestCitationVisibility } from './citation-snapshot';
import { decayedScore } from '@/lib/audit-time-decay';
import { enrichBenchmarkInsight } from './benchmark-copy';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

function parseMetadata(json: string): PatternStatMetadata {
  try {
    return PatternStatMetadataSchema.parse(parseJson(json, {}));
  } catch {
    return {};
  }
}

function categoryForPattern(patternType: string): BenchmarkInsight['category'] {
  switch (patternType) {
    case 'schema':
    case 'hierarchy':
    case 'structure':
      return 'structure';
    case 'faq':
    case 'chunk':
    case 'entity':
    case 'table':
    case 'platform':
      return 'content';
    case 'citation':
      return 'citations';
    case 'readability':
      return 'readability';
    default:
      return 'content';
  }
}

export async function getSiteTrend(siteId: string, limit = 30): Promise<SiteTrend> {
  const rollups = await prisma.auditRollup.findMany({
    where: { siteId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { overallScore: true, createdAt: true },
  });
  return {
    siteId,
    scores: rollups.map((r) => ({
      date: r.createdAt.toISOString(),
      score: r.overallScore,
      decayedScore: decayedScore(r.overallScore, r.createdAt),
    })),
  };
}

export async function getIntelligenceGraphSummary(siteId: string) {
  const trend = await getSiteTrend(siteId);
  const latestRollup = await prisma.auditRollup.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
  });
  const citationVisibility = await getLatestCitationVisibility(siteId);
  const signals = latestRollup ? parseRollupSignals(latestRollup.signals) : null;
  const patternTags = signals
    ? listPatternsFromSignals(signals, { targetVisibilityScore: citationVisibility }).map(
        (p) => `${p.patternType}:${p.patternKey}`,
      )
    : [];

  return {
    siteId,
    latestSignals: signals ?? undefined,
    trend,
    citationVisibility,
    patternTags,
  };
}

export async function getCohortInsights(cohortKey: string): Promise<BenchmarkInsight[]> {
  const rollupCount = await prisma.auditRollup.count();
  const min = getEffectiveMinCohortSamples(rollupCount);
  const stats = await prisma.patternStat.findMany({
    where: { cohortKey, sampleCount: { gte: min } },
    orderBy: { avgOverallScore: 'desc' },
    take: 12,
  });

  return stats.map((stat) => {
    const meta = parseMetadata(stat.metadata);
    const insightKind: InsightKind =
      meta.liftPoints !== undefined ? 'score_lift' : 'missing_pattern';
    return enrichBenchmarkInsight(
      {
        insightKind,
        category: categoryForPattern(stat.patternType),
        patternType: stat.patternType as BenchmarkInsight['patternType'],
        patternKey: stat.patternKey,
        cohortKey,
        sampleCount: stat.sampleCount,
        avgOverallScore: Math.round(stat.avgOverallScore),
        liftPoints: meta.liftPoints,
        liftPercent: meta.liftPercent,
        message: '',
      },
      meta,
    );
  });
}

export async function getBenchmarksForSite(siteId: string): Promise<BenchmarkInsight[]> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return [];

  const latestRollup = await prisma.auditRollup.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
  });
  if (!latestRollup) return [];

  const cohortKey = site.vertical ? `vertical:${site.vertical}` : 'global';
  const yourScore = latestRollup.overallScore;
  const citationVisibility = await getLatestCitationVisibility(siteId);
  const signals = parseRollupSignals(latestRollup.signals);
  const yourPatterns = signals
    ? new Set(
        listPatternsFromSignals(signals, { targetVisibilityScore: citationVisibility }).map(
          (p) => `${p.patternType}:${p.patternKey}`,
        ),
      )
    : new Set<string>();

  const insights: BenchmarkInsight[] = [];
  const rollupCount = await prisma.auditRollup.count();
  const min = getEffectiveMinCohortSamples(rollupCount);

  const stats = await prisma.patternStat.findMany({
    where: { cohortKey, sampleCount: { gte: min } },
    orderBy: [{ avgOverallScore: 'desc' }],
    take: 24,
  });

  for (const stat of stats) {
    const meta = parseMetadata(stat.metadata);
    const key = `${stat.patternType}:${stat.patternKey}`;
    const youHave = yourPatterns.has(key);

    if (youHave && meta.liftPoints !== undefined && meta.liftPoints > 0) {
      insights.push(
        enrichBenchmarkInsight(
          {
            insightKind: 'score_lift',
            category: categoryForPattern(stat.patternType),
            patternType: stat.patternType as BenchmarkInsight['patternType'],
            patternKey: stat.patternKey,
            cohortKey,
            sampleCount: stat.sampleCount,
            avgOverallScore: Math.round(stat.avgOverallScore),
            yourScore,
            liftPoints: meta.liftPoints,
            liftPercent: meta.liftPercent,
            youHavePattern: true,
            message: '',
          },
          meta,
        ),
      );
    }

    if (!youHave && (meta.liftPoints ?? 0) > 5) {
      insights.push(
        enrichBenchmarkInsight(
          {
            insightKind: 'missing_pattern',
            category: categoryForPattern(stat.patternType),
            patternType: stat.patternType as BenchmarkInsight['patternType'],
            patternKey: stat.patternKey,
            cohortKey,
            sampleCount: stat.sampleCount,
            avgOverallScore: Math.round(stat.avgOverallScore),
            yourScore,
            delta: meta.liftPoints ?? Math.round(stat.avgOverallScore - yourScore),
            liftPoints: meta.liftPoints,
            liftPercent: meta.liftPercent,
            youHavePattern: false,
            message: '',
          },
          meta,
        ),
      );
    }

    if (meta.platforms) {
      for (const [platform, platMeta] of Object.entries(meta.platforms)) {
        if (platMeta.sampleCount < min) continue;
        const platLift = platMeta.liftPoints ?? meta.liftPoints;
        if (platLift === undefined || platLift < 8) continue;
        insights.push(
          enrichBenchmarkInsight(
            {
              insightKind: 'platform',
              category: 'platform',
              patternType: stat.patternType as BenchmarkInsight['patternType'],
              patternKey: stat.patternKey,
              cohortKey: `platform:${platform}`,
              sampleCount: platMeta.sampleCount,
              avgOverallScore: Math.round(platMeta.avgScore),
              yourScore,
              liftPoints: platLift,
              youHavePattern: youHave,
              message: '',
            },
            meta,
          ),
        );
      }
    }

    if (
      meta.citationRateWith !== undefined &&
      meta.citationRateWithout !== undefined &&
      stat.patternType === 'citation'
    ) {
      const lift = Math.round((meta.citationRateWith - meta.citationRateWithout) * 100);
      if (lift > 10) {
        insights.push(
          enrichBenchmarkInsight(
            {
              insightKind: 'citation_lift',
              category: 'citations',
              patternType: 'citation',
              patternKey: stat.patternKey,
              cohortKey,
              sampleCount: stat.sampleCount,
              youHavePattern: youHave,
              message: '',
            },
            meta,
          ),
        );
      }
    }
  }

  if (insights.length === 0 && stats.length > 0) {
    for (const stat of stats.slice(0, 8)) {
      const key = `${stat.patternType}:${stat.patternKey}`;
      const youHave = yourPatterns.has(key);
      const avg = Math.round(stat.avgOverallScore);
      const meta = parseMetadata(stat.metadata);
      insights.push(
        enrichBenchmarkInsight(
          {
            insightKind: youHave ? 'score_lift' : 'missing_pattern',
            category: categoryForPattern(stat.patternType),
            patternType: stat.patternType as BenchmarkInsight['patternType'],
            patternKey: stat.patternKey,
            cohortKey,
            sampleCount: stat.sampleCount,
            avgOverallScore: avg,
            yourScore,
            delta: avg - yourScore,
            youHavePattern: youHave,
            message: '',
          },
          meta,
        ),
      );
    }
  }

  const ranked = insights.sort((a, b) => (b.liftPoints ?? b.delta ?? 0) - (a.liftPoints ?? a.delta ?? 0));
  return ranked.slice(0, 10);
}

export async function getPlaybook(issueKey: string): Promise<PlaybookEntry | null> {
  const occurrences = await prisma.issueOccurrence.findMany({
    where: { issueKey },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });
  if (occurrences.length === 0) return null;

  const fixOutcomes = await prisma.fixOutcome.findMany({
    where: { issueKey, verifiedAt: { not: null }, scoreAfter: { not: null } },
    take: 50,
  });

  let avgScoreLift: number | undefined;
  if (fixOutcomes.length > 0) {
    const lifts = fixOutcomes
      .filter((f) => f.scoreAfter != null)
      .map((f) => (f.scoreAfter as number) - f.scoreBefore);
    if (lifts.length > 0) {
      avgScoreLift = Math.round(lifts.reduce((a, b) => a + b, 0) / lifts.length);
    }
  }

  const artifactType = fixOutcomes[0]?.artifactType;
  const patterns = await prisma.patternStat.findMany({
    where: { sampleCount: { gte: getMinCohortSamples() } },
    orderBy: { avgOverallScore: 'desc' },
    take: 3,
  });

  return {
    issueKey,
    artifactType,
    avgScoreLift,
    sampleCount: occurrences.length,
    recommendation:
      avgScoreLift && avgScoreLift > 0
        ? `Sites that applied ${artifactType ?? 'similar fixes'} for this issue saw an average +${avgScoreLift} point lift.`
        : `This issue appeared in ${occurrences.length} audits. Consider the recommended artifact type for this dimension.`,
    patterns: patterns.map((p) => {
      const meta = parseMetadata(p.metadata);
      const lift = meta.liftPoints !== undefined ? `+${meta.liftPoints} lift` : `avg ${Math.round(p.avgOverallScore)}`;
      return `${p.patternType}:${p.patternKey} (${lift})`;
    }),
  };
}

/** Context string for LLM prompts (optimization / narrative). */
export async function getIntelligenceContext(siteId: string | null): Promise<string> {
  if (!siteId) return '';
  const benchmarks = await getBenchmarksForSite(siteId);
  if (benchmarks.length === 0) return '';
  return benchmarks
    .slice(0, 3)
    .map((b) => b.summary)
    .join('\n');
}

export async function findSimilarCohortChunks(
  cohortKey: string,
  queryText: string,
  topK = 5,
): Promise<Array<{ textPreview: string; score: number; overallScore: number; signalTags: string[] }>> {
  const { vector: qv } = await getEmbeddingsAI().generateEmbedding({
    text: queryText.slice(0, 4000),
  });
  const rows = await prisma.patternEmbedding.findMany({
    where: { cohortKey },
    take: 200,
    orderBy: { overallScore: 'desc' },
  });
  return rows
    .map((r) => {
      const v = parseJson<number[]>(r.vector, []);
      return {
        textPreview: r.textPreview,
        score: cosineSimilarity(qv, v),
        overallScore: r.overallScore,
        signalTags: parseJson<string[]>(r.signalTags, []),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function recordFixApplied(input: {
  siteId: string;
  optimizationId: string;
  issueKey: string;
  artifactType: string;
  scoreBefore: number;
  dimensionBefore: Record<string, number>;
}): Promise<void> {
  await prisma.fixOutcome.create({
    data: {
      siteId: input.siteId,
      optimizationId: input.optimizationId,
      issueKey: input.issueKey,
      artifactType: input.artifactType,
      scoreBefore: input.scoreBefore,
      dimensionBefore: stringifyJson(input.dimensionBefore),
    },
  });
}

export async function verifyPendingFixOutcomes(siteId: string, scoreAfter: number, dimensionsJson: string): Promise<void> {
  const dims = parseJson<Record<string, DimensionScore>>(dimensionsJson, {});
  const dimScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims)) {
    dimScores[k] = v.score;
  }

  const pending = await prisma.fixOutcome.findMany({
    where: { siteId, verifiedAt: null },
    orderBy: { appliedAt: 'desc' },
    take: 10,
  });

  for (const f of pending) {
    await prisma.fixOutcome.update({
      where: { id: f.id },
      data: {
        scoreAfter,
        dimensionAfter: stringifyJson(dimScores),
        verifiedAt: new Date(),
      },
    });
  }
}
