/**
 * Extract rollup signals from audit extractions (no full HTML).
 */

import { parseJson } from '@shared/database/client';
import type { PageExtraction } from '@modules/extraction';
import { RollupSignalsSchema, type RollupSignals, type PatternType } from './schemas';

export type { RollupSignals };

export interface PatternKeyRef {
  patternType: PatternType;
  patternKey: string;
}

export function extractRollupSignals(
  extractions: PageExtraction[],
  dimensionScores: Record<string, number> = {},
): RollupSignals {
  const schemaSet = new Set<string>();
  let faqCount = 0;
  let faqSchemaBacked = false;
  let chunkCount = 0;
  let answerFirst = 0;
  let withLists = 0;
  let withNumbers = 0;

  const headings: Array<{ level: number }> = [];
  const entityMap = new Map<string, { name: string; kind: string }>();
  let comparisonTableCount = 0;
  let totalTableRows = 0;
  let authorCount = 0;
  let hasByline = false;

  for (const ext of extractions) {
    for (const s of ext.schemas) {
      if (s.type) schemaSet.add(s.type);
    }
    for (const f of ext.faqs) {
      faqCount++;
      if (f.source === 'schema') faqSchemaBacked = true;
    }
    for (const c of ext.chunks) {
      chunkCount++;
      if (c.hasAnswerFirstSentence) answerFirst++;
      if (c.hasList) withLists++;
      if (c.hasNumbers) withNumbers++;
    }
    for (const h of ext.headings) headings.push({ level: h.level });
    for (const e of ext.entities) {
      const key = `${e.kind}:${e.name.toLowerCase()}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { name: e.name, kind: e.kind });
      }
    }
    for (const t of ext.tables) {
      if (t.headers.length > 0 && t.rows.length > 0) {
        comparisonTableCount++;
        totalTableRows += t.rows.length;
      }
    }
    authorCount += ext.authors.length;
    if (ext.authors.some((a) => a.source === 'byline' || a.source === 'rel-author')) {
      hasByline = true;
    }
  }

  const hierarchy = computeHierarchySignals(headings);
  const topEntities = [...entityMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12);

  const signals: RollupSignals = {
    schemaCoverage: { types: [...schemaSet].sort(), count: schemaSet.size },
    faq: { count: faqCount, schemaBacked: faqSchemaBacked },
    chunks: {
      count: chunkCount,
      answerFirstRatio: chunkCount > 0 ? answerFirst / chunkCount : null,
      withLists,
      withNumbers,
    },
    hierarchy,
    entities: {
      top: topEntities,
      uniqueCount: entityMap.size,
      orgPresent: topEntities.some((e) => e.kind === 'organization'),
    },
    tables: { comparisonTableCount, totalRows: totalTableRows },
    readability: {
      aiReadability: dimensionScores.aiReadability ?? 0,
      semanticClarity: dimensionScores.semanticClarity ?? 0,
      answerExtraction: dimensionScores.answerExtraction ?? 0,
      summarizationQuality: dimensionScores.summarizationQuality ?? 0,
    },
    authors: { count: authorCount, hasByline },
  };

  return RollupSignalsSchema.parse(signals);
}

function computeHierarchySignals(headings: Array<{ level: number }>): RollupSignals['hierarchy'] {
  if (headings.length === 0) {
    return { h1Count: 0, maxDepth: 0, skippedLevels: 0, outlineScore: 0 };
  }

  const h1Count = headings.filter((h) => h.level === 1).length;
  const maxDepth = Math.max(...headings.map((h) => h.level));
  let skippedLevels = 0;
  for (let i = 1; i < headings.length; i++) {
    const jump = headings[i].level - headings[i - 1].level;
    if (jump > 1) skippedLevels++;
  }

  let outlineScore = 40;
  if (h1Count >= 1) outlineScore += 25;
  if (maxDepth >= 2) outlineScore += 15;
  if (skippedLevels === 0) outlineScore += 20;
  outlineScore = Math.min(100, outlineScore);

  return { h1Count, maxDepth, skippedLevels, outlineScore };
}

/** Derive pattern keys recorded for cohort analytics. */
export function listPatternsFromSignals(
  signals: RollupSignals,
  opts?: { targetVisibilityScore?: number | null },
): PatternKeyRef[] {
  const out: PatternKeyRef[] = [];

  for (const t of signals.schemaCoverage.types) {
    out.push({ patternType: 'schema', patternKey: t });
  }
  if (signals.faq.count > 0) {
    out.push({ patternType: 'faq', patternKey: 'has-faq' });
  }
  if (signals.chunks.answerFirstRatio !== null && signals.chunks.answerFirstRatio >= 0.5) {
    out.push({ patternType: 'chunk', patternKey: 'answer-first-majority' });
  }
  if (signals.chunks.count >= 4) {
    out.push({ patternType: 'structure', patternKey: 'multi-chunk' });
  }
  if (signals.hierarchy.h1Count >= 1 && signals.hierarchy.skippedLevels === 0 && signals.hierarchy.outlineScore >= 70) {
    out.push({ patternType: 'hierarchy', patternKey: 'clean-h1-h2' });
  }
  if (signals.tables.comparisonTableCount > 0) {
    out.push({ patternType: 'table', patternKey: 'has-comparison' });
  }
  if (signals.entities.orgPresent) {
    out.push({ patternType: 'entity', patternKey: 'organization-present' });
  }
  if (signals.readability.aiReadability >= 75) {
    out.push({ patternType: 'readability', patternKey: 'ai-readability-high' });
  }
  if (opts?.targetVisibilityScore !== undefined && opts.targetVisibilityScore !== null && opts.targetVisibilityScore >= 0.5) {
    out.push({ patternType: 'citation', patternKey: 'target-visible' });
  }

  return out;
}

/** Tags stored on graph embeddings for filtered search. */
export function signalTagsFromRollup(signals: RollupSignals): string[] {
  const tags = new Set<string>();
  for (const t of signals.schemaCoverage.types) tags.add(t);
  if (signals.faq.count > 0) tags.add('faq');
  if (signals.chunks.answerFirstRatio !== null && signals.chunks.answerFirstRatio >= 0.5) {
    tags.add('answer-first');
  }
  if (signals.tables.comparisonTableCount > 0) tags.add('comparison-table');
  if (signals.entities.orgPresent) tags.add('organization');
  if (signals.hierarchy.outlineScore >= 70) tags.add('clean-hierarchy');
  return [...tags];
}

export function parseExtractionRow(row: {
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
    metadata: parseJson(row.metadata, {} as PageExtraction['metadata']),
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

export function parseRollupSignals(json: string | null | undefined): RollupSignals | null {
  if (!json || json === '{}') return null;
  try {
    return RollupSignalsSchema.parse(parseJson(json, {}));
  } catch {
    return null;
  }
}

/** Legacy flat fields for backward-compatible DB columns. */
export function legacyFieldsFromSignals(signals: RollupSignals) {
  return {
    schemaTypes: signals.schemaCoverage.types,
    faqCount: signals.faq.count,
    chunkCount: signals.chunks.count,
    answerFirstRatio: signals.chunks.answerFirstRatio,
  };
}
