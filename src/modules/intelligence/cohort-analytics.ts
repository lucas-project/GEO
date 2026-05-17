/**
 * Comparative cohort analytics — with/without pattern lift stats.
 */

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { config } from '@shared/config';
import {
  listPatternsFromSignals,
  parseRollupSignals,
  legacyFieldsFromSignals,
  type PatternKeyRef,
} from './rollup';
import type { PatternStatMetadata, PatternType } from './schemas';
import { getLatestCitationVisibility, parsePlatformBreakdown } from './citation-snapshot';

const cohortLogger = logger.child({ module: 'cohort-analytics' });

export interface RollupRecord {
  siteId: string;
  auditId: string;
  overallScore: number;
  vertical: string | null;
  signalsJson: string;
  citationVisibility: number | null;
  platformHits: string[];
}

function liftPercent(withAvg: number, withoutAvg: number): number | undefined {
  if (withoutAvg <= 0) return undefined;
  return Math.round(((withAvg - withoutAvg) / withoutAvg) * 100);
}

export function buildCohortKeys(record: RollupRecord): string[] {
  const keys = new Set<string>(['global']);
  if (record.vertical) keys.add(`vertical:${record.vertical}`);
  if (record.overallScore >= config.intelligence.highScoreEmbeddingThreshold) {
    keys.add('scoreBand:80-100');
  }
  for (const p of record.platformHits) keys.add(`platform:${p}`);
  return [...keys];
}

function sitePatterns(
  signalsJson: string,
  citationVisibility: number | null,
): PatternKeyRef[] {
  const signals = parseRollupSignals(signalsJson);
  if (!signals) return [];
  return listPatternsFromSignals(signals, { targetVisibilityScore: citationVisibility });
}

export async function loadRollupRecords(): Promise<RollupRecord[]> {
  const rollups = await prisma.auditRollup.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      siteId: true,
      auditId: true,
      overallScore: true,
      vertical: true,
      signals: true,
      schemaTypes: true,
      faqCount: true,
      chunkCount: true,
      answerFirstRatio: true,
    },
  });

  const visibilityBySite = new Map<string, number>();
  const platformHitsBySite = new Map<string, string[]>();

  const snaps = await prisma.citationSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    select: { siteId: true, targetVisibilityScore: true, platformBreakdown: true },
  });
  for (const s of snaps) {
    if (visibilityBySite.has(s.siteId)) continue;
    visibilityBySite.set(s.siteId, s.targetVisibilityScore);
    const breakdown = parsePlatformBreakdown(s.platformBreakdown);
    const hits = Object.entries(breakdown)
      .filter(([, v]) => v.targetCitedRuns > 0)
      .map(([platform]) => platform);
    platformHitsBySite.set(s.siteId, hits);
  }

  return rollups.map((r) => ({
    siteId: r.siteId,
    auditId: r.auditId,
    overallScore: r.overallScore,
    vertical: r.vertical,
    signalsJson: r.signals && r.signals !== '{}' ? r.signals : legacySignalsJson(r),
    citationVisibility: visibilityBySite.get(r.siteId) ?? null,
    platformHits: platformHitsBySite.get(r.siteId) ?? [],
  }));
}

/** Rebuild legacy signals JSON from flat rollup columns when signals empty. */
function legacySignalsJson(r: {
  schemaTypes: string;
  faqCount: number;
  chunkCount: number;
  answerFirstRatio: number | null;
}): string {
  const types = parseJson<string[]>(r.schemaTypes, []);
  const pseudo = {
    schemaCoverage: { types, count: types.length },
    faq: { count: r.faqCount, schemaBacked: false },
    chunks: {
      count: r.chunkCount,
      answerFirstRatio: r.answerFirstRatio,
      withLists: 0,
      withNumbers: 0,
    },
    hierarchy: { h1Count: 0, maxDepth: 0, skippedLevels: 0, outlineScore: 0 },
    entities: { top: [], uniqueCount: 0, orgPresent: false },
    tables: { comparisonTableCount: 0, totalRows: 0 },
    readability: {
      aiReadability: 0,
      semanticClarity: 0,
      answerExtraction: 0,
      summarizationQuality: 0,
    },
    authors: { count: 0, hasByline: false },
  };
  return stringifyJson(pseudo);
}

interface PatternAccumulator {
  withScores: number[];
  withoutScores: number[];
  withCitation: number[];
  withoutCitation: number[];
  platformWith: Map<string, number[]>;
}

/** Batch recompute PatternStat with comparative lift metadata. */
export async function reindexComparativePatterns(): Promise<{ patternsUpdated: number }> {
  const started = Date.now();
  const records = await loadRollupRecords();
  await prisma.patternStat.deleteMany({});

  type Key = `${string}\0${PatternType}\0${string}`;
  const acc = new Map<Key, PatternAccumulator>();

  function getAcc(cohortKey: string, patternType: PatternType, patternKey: string): PatternAccumulator {
    const k = `${cohortKey}\0${patternType}\0${patternKey}` as Key;
    let a = acc.get(k);
    if (!a) {
      a = {
        withScores: [],
        withoutScores: [],
        withCitation: [],
        withoutCitation: [],
        platformWith: new Map(),
      };
      acc.set(k, a);
    }
    return a;
  }

  const allPatternKeys = new Set<string>();
  const patternsByRecord = records.map((r) => {
    const pats = sitePatterns(r.signalsJson, r.citationVisibility);
    for (const p of pats) allPatternKeys.add(`${p.patternType}:${p.patternKey}`);
    return new Set(pats.map((p) => `${p.patternType}:${p.patternKey}`));
  });

  for (let ri = 0; ri < records.length; ri++) {
    const record = records[ri];
    const patterns = patternsByRecord[ri];
    const cohorts = buildCohortKeys(record);

    for (const cohortKey of cohorts) {
      for (const key of allPatternKeys) {
        const [patternType, patternKey] = key.split(':') as [PatternType, string];
        const has = patterns.has(key);
        const a = getAcc(cohortKey, patternType, patternKey);
        if (has) {
          a.withScores.push(record.overallScore);
          if (record.citationVisibility !== null) {
            a.withCitation.push(record.citationVisibility);
          }
          for (const plat of record.platformHits) {
            if (!a.platformWith.has(plat)) a.platformWith.set(plat, []);
            a.platformWith.get(plat)!.push(record.overallScore);
          }
        } else {
          a.withoutScores.push(record.overallScore);
          if (record.citationVisibility !== null) {
            a.withoutCitation.push(record.citationVisibility);
          }
        }
      }
    }
  }

  let created = 0;
  for (const [key, a] of acc) {
    const [cohortKey, patternType, patternKey] = key.split('\0') as [string, PatternType, string];
    const withCount = a.withScores.length;
    if (withCount === 0) continue;

    const withAvg = a.withScores.reduce((s, v) => s + v, 0) / withCount;
    const withoutCount = a.withoutScores.length;
    const withoutAvg =
      withoutCount > 0 ? a.withoutScores.reduce((s, v) => s + v, 0) / withoutCount : undefined;
    const liftPoints = withoutAvg !== undefined ? Math.round(withAvg - withoutAvg) : undefined;
    const liftPct = withoutAvg !== undefined ? liftPercent(withAvg, withoutAvg) : undefined;

    const citationRateWith =
      a.withCitation.length > 0
        ? a.withCitation.reduce((s, v) => s + v, 0) / a.withCitation.length
        : undefined;
    const citationRateWithout =
      a.withoutCitation.length > 0
        ? a.withoutCitation.reduce((s, v) => s + v, 0) / a.withoutCitation.length
        : undefined;

    const platforms: PatternStatMetadata['platforms'] = {};
    for (const [plat, scores] of a.platformWith) {
      if (scores.length < 3) continue;
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      platforms[plat] = { sampleCount: scores.length, avgScore: Math.round(avg * 10) / 10 };
    }

    const metadata: PatternStatMetadata = {
      withPatternAvgScore: Math.round(withAvg * 10) / 10,
      withoutPatternAvgScore: withoutAvg !== undefined ? Math.round(withoutAvg * 10) / 10 : undefined,
      liftPoints,
      liftPercent: liftPct,
      citationRateWith,
      citationRateWithout,
      withCount,
      withoutCount,
      platforms: Object.keys(platforms).length > 0 ? platforms : undefined,
    };

    await prisma.patternStat.create({
      data: {
        cohortKey,
        patternType,
        patternKey,
        sampleCount: withCount,
        avgOverallScore: withAvg,
        p50Score: withAvg,
        metadata: stringifyJson(metadata),
      },
    });
    created++;
  }

  cohortLogger.info({ patternsUpdated: created, durationMs: Date.now() - started }, 'comparative patterns reindexed');
  return { patternsUpdated: created };
}

export { getLatestCitationVisibility };
