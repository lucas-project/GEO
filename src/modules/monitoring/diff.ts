/**
 * Diff audits for monitoring alerts — scores, schema, citation, entities, and more.
 */

import { randomId } from '@shared/util/id';
import { config } from '@shared/config';
import { parseJson, stringifyJson } from '@shared/database/client';
import { type DimensionScore, DIMENSIONS, type Issue } from '@modules/geo-audit';
import { buildIssueKey } from '@modules/intelligence';
import type { Alert, MonitoringDiffPayload } from './schemas';

interface AuditLike {
  id?: string;
  overallScore: number;
  dimensions: string;
  topIssues?: string;
}

export interface MonitorExtractionSignals {
  schemaTypes: string[];
  faqCount: number;
  entityUniqueCount: number;
  orgPresent: boolean;
  hierarchyOutlineScore: number;
  chunkCount: number;
  answerFirstRatio: number | null;
}

export interface CrawlHealthSignals {
  pageCount: number;
  errorCount: number;
}

export interface CitationSignals {
  targetVisibilityScore: number | null;
}

export interface CompetitorSignals {
  behindCount: number;
  gaps: Array<{ competitorUrl: string; overallGap: number }>;
}

export interface MonitorDiffContext {
  prevExtraction?: MonitorExtractionSignals;
  curExtraction?: MonitorExtractionSignals;
  prevCitation?: CitationSignals;
  curCitation?: CitationSignals;
  prevCrawl?: CrawlHealthSignals;
  curCrawl?: CrawlHealthSignals;
  prevCompetitors?: CompetitorSignals;
  curCompetitors?: CompetitorSignals;
}

const REGRESSION_THRESHOLD = config.monitoring.overallRegressionThreshold;
const IMPROVEMENT_THRESHOLD = config.monitoring.improvementThreshold;
const DIMENSION_DELTA_THRESHOLD = config.monitoring.dimensionDeltaThreshold;
const CITATION_DELTA_THRESHOLD = config.monitoring.citationDeltaThreshold;
const ENTITY_DELTA_THRESHOLD = config.monitoring.entityDeltaThreshold;
const READABILITY_DELTA_THRESHOLD = config.monitoring.readabilityDeltaThreshold;

function extractSchemaTypes(schemasJson: string): string[] {
  const schemas = parseJson<Array<{ type?: string }>>(schemasJson, []);
  return [...new Set(schemas.map((s) => s.type).filter(Boolean) as string[])].sort();
}

function faqCountFromJson(faqsJson: string): number {
  return parseJson<unknown[]>(faqsJson, []).length;
}

function hierarchyOutlineScore(headingsJson: string): number {
  const headings = parseJson<Array<{ level: number }>>(headingsJson, []);
  if (headings.length === 0) return 0;
  const h1 = headings.filter((h) => h.level === 1).length;
  let skips = 0;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) skips++;
  }
  let score = 40;
  if (h1 >= 1) score += 25;
  if (Math.max(...headings.map((h) => h.level)) >= 2) score += 15;
  if (skips === 0) score += 20;
  return Math.min(100, score);
}

export function signalsFromExtractions(
  rows: Array<{
    schemas: string;
    faqs: string;
    entities: string;
    headings: string;
    chunks: string;
  }>,
): MonitorExtractionSignals {
  const schemaSet = new Set<string>();
  let faqCount = 0;
  const entityKeys = new Set<string>();
  let orgPresent = false;
  let chunkCount = 0;
  let answerFirst = 0;
  let outlineTotal = 0;

  for (const r of rows) {
    for (const t of extractSchemaTypes(r.schemas)) schemaSet.add(t);
    faqCount += faqCountFromJson(r.faqs);
    outlineTotal += hierarchyOutlineScore(r.headings);

    const entities = parseJson<Array<{ name: string; kind: string }>>(r.entities, []);
    for (const e of entities) {
      entityKeys.add(`${e.kind}:${e.name.toLowerCase()}`);
      if (e.kind === 'organization') orgPresent = true;
    }

    const chunks = parseJson<Array<{ hasAnswerFirstSentence?: boolean }>>(r.chunks, []);
    chunkCount += chunks.length;
    answerFirst += chunks.filter((c) => c.hasAnswerFirstSentence).length;
  }

  return {
    schemaTypes: [...schemaSet].sort(),
    faqCount,
    entityUniqueCount: entityKeys.size,
    orgPresent,
    hierarchyOutlineScore: rows.length > 0 ? Math.round(outlineTotal / rows.length) : 0,
    chunkCount,
    answerFirstRatio: chunkCount > 0 ? answerFirst / chunkCount : null,
  };
}

export function crawlHealthFromResults(
  rows: Array<{ error: string | null; renderedHtml: string | null }>,
): CrawlHealthSignals {
  return {
    pageCount: rows.length,
    errorCount: rows.filter((r) => r.error || !r.renderedHtml).length,
  };
}

export function competitorSignalsFromReports(
  rows: Array<{ competitorUrl: string; diff: string }>,
): CompetitorSignals {
  const gaps: CompetitorSignals['gaps'] = [];
  for (const r of rows) {
    const parsed = parseJson<{ overallGap?: number }>(r.diff, {});
    gaps.push({
      competitorUrl: r.competitorUrl,
      overallGap: parsed.overallGap ?? 0,
    });
  }
  return {
    behindCount: gaps.filter((g) => g.overallGap < 0).length,
    gaps,
  };
}

export function diffAudits(
  previous: AuditLike,
  current: AuditLike,
  ctx?: MonitorDiffContext,
): { alerts: Alert[]; diff: MonitoringDiffPayload } {
  const alerts: Alert[] = [];
  const dimensionDeltas: Record<string, number> = {};

  const prevOverall = previous.overallScore;
  const curOverall = current.overallScore;
  const deltaOverall = curOverall - prevOverall;

  if (deltaOverall <= -REGRESSION_THRESHOLD) {
    alerts.push({
      id: randomId(),
      severity: 'regression',
      kind: 'score',
      title: `GEO score dropped ${Math.abs(deltaOverall)} points`,
      detail: `Overall fell from ${prevOverall} to ${curOverall}.`,
      dimension: null,
      delta: deltaOverall,
    });
  } else if (deltaOverall >= IMPROVEMENT_THRESHOLD) {
    alerts.push({
      id: randomId(),
      severity: 'info',
      kind: 'score',
      title: `GEO score improved ${deltaOverall} points`,
      detail: `Overall rose from ${prevOverall} to ${curOverall}.`,
      dimension: null,
      delta: deltaOverall,
    });
  }

  const prevDims = parseJson<Record<string, DimensionScore>>(previous.dimensions, {});
  const curDims = parseJson<Record<string, DimensionScore>>(current.dimensions, {});

  for (const dim of DIMENSIONS) {
    const pv = prevDims[dim]?.score ?? 0;
    const cv = curDims[dim]?.score ?? 0;
    const delta = cv - pv;
    dimensionDeltas[dim] = delta;
    if (Math.abs(delta) < DIMENSION_DELTA_THRESHOLD) continue;

    const kind =
      dim === 'citationFriendliness'
        ? 'citation'
        : dim === 'entityClarity'
          ? 'entity'
          : dim === 'aiReadability'
            ? 'readability'
            : dim === 'structuredContent'
              ? 'structure'
              : 'visibility';

    alerts.push({
      id: randomId(),
      severity: delta < 0 ? 'regression' : 'info',
      kind,
      title: `${dim} ${delta < 0 ? 'regressed' : 'improved'} by ${Math.abs(delta)} points`,
      detail: `From ${pv} to ${cv}.`,
      dimension: dim,
      delta,
    });
  }

  const schemas = { removed: [] as string[], added: [] as string[] };
  const faqs = { prevCount: 0, curCount: 0 };
  const issues = { newCritical: [] as string[], resolved: [] as string[] };

  if (ctx?.prevExtraction && ctx?.curExtraction) {
    const prevSchemas = new Set(ctx.prevExtraction.schemaTypes);
    const curSchemas = new Set(ctx.curExtraction.schemaTypes);
    for (const t of prevSchemas) {
      if (!curSchemas.has(t)) schemas.removed.push(t);
    }
    for (const t of curSchemas) {
      if (!prevSchemas.has(t)) schemas.added.push(t);
    }

    faqs.prevCount = ctx.prevExtraction.faqCount;
    faqs.curCount = ctx.curExtraction.faqCount;

    if (schemas.removed.length > 0) {
      const highLift = schemas.removed.includes('FAQPage');
      alerts.push({
        id: randomId(),
        severity: 'regression',
        kind: 'schema',
        title: `Schema drift: removed ${schemas.removed.join(', ')}`,
        detail: highLift
          ? 'FAQPage schema was removed — cohort data often shows a significant GEO lift when FAQ structured data is present.'
          : 'JSON-LD types present in the previous audit are missing now.',
        dimension: 'structuredContent',
        delta: null,
      });
    }

    if (schemas.added.length > 0) {
      alerts.push({
        id: randomId(),
        severity: 'info',
        kind: 'schema',
        title: `Schema added: ${schemas.added.join(', ')}`,
        detail: 'New structured data types detected vs previous baseline.',
        dimension: 'structuredContent',
        delta: null,
      });
    }

    if (
      faqs.curCount < faqs.prevCount &&
      (faqs.prevCount > 0 || prevSchemas.has('FAQPage'))
    ) {
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'structure',
        title: `FAQ count dropped (${faqs.prevCount} → ${faqs.curCount})`,
        detail: 'Fewer FAQ entries detected than the previous audit.',
        dimension: 'citationFriendliness',
        delta: faqs.curCount - faqs.prevCount,
      });
    }

    const entityDelta = ctx.curExtraction.entityUniqueCount - ctx.prevExtraction.entityUniqueCount;
    if (entityDelta <= -ENTITY_DELTA_THRESHOLD) {
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'entity',
        title: `Entity consistency declined (${ctx.prevExtraction.entityUniqueCount} → ${ctx.curExtraction.entityUniqueCount})`,
        detail: 'Fewer unique entities detected — NER/schema entity coverage may have regressed.',
        dimension: 'entityClarity',
        delta: entityDelta,
      });
    }

    if (ctx.prevExtraction.orgPresent && !ctx.curExtraction.orgPresent) {
      alerts.push({
        id: randomId(),
        severity: 'regression',
        kind: 'entity',
        title: 'Organization entity no longer detected',
        detail: 'Brand/organization signals dropped from extraction baseline.',
        dimension: 'entityClarity',
        delta: null,
      });
    }

    const hierarchyDelta =
      ctx.curExtraction.hierarchyOutlineScore - ctx.prevExtraction.hierarchyOutlineScore;
    if (hierarchyDelta <= -15) {
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'structure',
        title: `Semantic structure weakened (outline ${ctx.prevExtraction.hierarchyOutlineScore} → ${ctx.curExtraction.hierarchyOutlineScore})`,
        detail: 'Heading hierarchy quality score dropped — check H1/H2 structure and skipped levels.',
        dimension: 'semanticClarity',
        delta: hierarchyDelta,
      });
    }
  }

  const readability: MonitoringDiffPayload['readability'] = {
    aiReadabilityDelta:
      (curDims.aiReadability?.score ?? 0) - (prevDims.aiReadability?.score ?? 0),
    semanticClarityDelta:
      (curDims.semanticClarity?.score ?? 0) - (prevDims.semanticClarity?.score ?? 0),
  };

  if (readability.aiReadabilityDelta <= -READABILITY_DELTA_THRESHOLD) {
    alerts.push({
      id: randomId(),
      severity: 'regression',
      kind: 'readability',
      title: `AI readability degraded by ${Math.abs(readability.aiReadabilityDelta)} points`,
      detail: 'Content may be harder for models to parse and cite.',
      dimension: 'aiReadability',
      delta: readability.aiReadabilityDelta,
    });
  }

  if (ctx?.prevCitation && ctx?.curCitation) {
    const pv = ctx.prevCitation.targetVisibilityScore;
    const cv = ctx.curCitation.targetVisibilityScore;
    if (pv !== null && cv !== null) {
      const citationDelta = cv - pv;
      if (citationDelta <= -CITATION_DELTA_THRESHOLD) {
        alerts.push({
          id: randomId(),
          severity: 'regression',
          kind: 'citation',
          title: `Citation probability dropped ${Math.round(Math.abs(citationDelta) * 100)}%`,
          detail: `Target visibility in simulations fell from ${Math.round(pv * 100)}% to ${Math.round(cv * 100)}% of runs.`,
          dimension: 'citationFriendliness',
          delta: citationDelta,
        });
      } else if (citationDelta >= CITATION_DELTA_THRESHOLD) {
        alerts.push({
          id: randomId(),
          severity: 'info',
          kind: 'citation',
          title: `Citation visibility improved ${Math.round(citationDelta * 100)}%`,
          detail: `Target cited in ${Math.round(cv * 100)}% of simulation runs (was ${Math.round(pv * 100)}%).`,
          dimension: 'citationFriendliness',
          delta: citationDelta,
        });
      }
    }
  }

  if (ctx?.prevCrawl && ctx?.curCrawl) {
    const newErrors = ctx.curCrawl.errorCount - ctx.prevCrawl.errorCount;
    if (ctx.curCrawl.errorCount > 0 && newErrors > 0) {
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'extraction',
        title: `Extraction failures increased (${ctx.prevCrawl.errorCount} → ${ctx.curCrawl.errorCount} pages)`,
        detail: `${ctx.curCrawl.errorCount} of ${ctx.curCrawl.pageCount} pages failed crawl or render.`,
        dimension: 'crawlerFriendliness',
        delta: newErrors,
      });
    }
    if (ctx.curCrawl.pageCount === 0) {
      alerts.push({
        id: randomId(),
        severity: 'regression',
        kind: 'extraction',
        title: 'No pages extracted in monitoring cycle',
        detail: 'Crawl returned zero usable pages — site may be down or blocking the crawler.',
        dimension: 'crawlerFriendliness',
        delta: null,
      });
    }
  }

  if (ctx?.curCompetitors) {
    if (ctx.curCompetitors.behindCount > 0) {
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'competitor',
        title: `Behind ${ctx.curCompetitors.behindCount} competitor(s) on GEO score`,
        detail: 'Latest competitor comparison shows lower overall score vs tracked rivals.',
        dimension: null,
        delta: -ctx.curCompetitors.behindCount,
      });
    }

    if (ctx.prevCompetitors) {
      const gapChanges: Array<{ competitorUrl: string; gapDelta: number }> = [];
      for (const cur of ctx.curCompetitors.gaps) {
        const prev = ctx.prevCompetitors.gaps.find((g) => g.competitorUrl === cur.competitorUrl);
        if (!prev) continue;
        const gapDelta = cur.overallGap - prev.overallGap;
        if (gapDelta <= -10) {
          gapChanges.push({ competitorUrl: cur.competitorUrl, gapDelta });
          alerts.push({
            id: randomId(),
            severity: 'regression',
            kind: 'competitor',
            title: `Competitor gaining: ${cur.competitorUrl}`,
            detail: `GEO gap vs target narrowed by ${Math.abs(gapDelta)} points (competitor visibility movement).`,
            dimension: null,
            delta: gapDelta,
          });
        }
      }
    }
  }

  const prevIssues = parseJson<Issue[]>(previous.topIssues ?? '[]', []);
  const curIssues = parseJson<Issue[]>(current.topIssues ?? '[]', []);
  const prevKeys = new Set(
    prevIssues.map((i) => i.issueKey ?? buildIssueKey(i.dimension, i.title)),
  );
  const curKeys = new Set(
    curIssues.map((i) => i.issueKey ?? buildIssueKey(i.dimension, i.title)),
  );

  for (const issue of curIssues) {
    const key = issue.issueKey ?? buildIssueKey(issue.dimension, issue.title);
    if (!prevKeys.has(key) && (issue.severity === 'critical' || issue.severity === 'high')) {
      issues.newCritical.push(key);
      alerts.push({
        id: randomId(),
        severity: 'warning',
        kind: 'issue',
        title: `New ${issue.severity} issue: ${issue.title.slice(0, 80)}`,
        detail: issue.description.slice(0, 200),
        dimension: issue.dimension,
        delta: null,
      });
    }
  }

  for (const key of prevKeys) {
    if (!curKeys.has(key)) issues.resolved.push(key);
  }

  const diff: MonitoringDiffPayload = {
    fromAuditId: previous.id,
    toAuditId: current.id,
    scores: { overallDelta: deltaOverall, dimensionDeltas },
    schemas,
    faqs,
    issues,
    readability,
    ...(ctx?.prevCitation || ctx?.curCitation
      ? {
          citation: {
            prevVisibility: ctx?.prevCitation?.targetVisibilityScore ?? null,
            curVisibility: ctx?.curCitation?.targetVisibilityScore ?? null,
            delta:
              ctx?.prevCitation?.targetVisibilityScore != null &&
              ctx?.curCitation?.targetVisibilityScore != null
                ? ctx.curCitation.targetVisibilityScore - ctx.prevCitation.targetVisibilityScore
                : null,
          },
        }
      : {}),
    ...(ctx?.prevExtraction && ctx?.curExtraction
      ? {
          entities: {
            prevUnique: ctx.prevExtraction.entityUniqueCount,
            curUnique: ctx.curExtraction.entityUniqueCount,
            orgLost: ctx.prevExtraction.orgPresent && !ctx.curExtraction.orgPresent,
          },
          hierarchy: {
            prevOutlineScore: ctx.prevExtraction.hierarchyOutlineScore,
            curOutlineScore: ctx.curExtraction.hierarchyOutlineScore,
            delta:
              ctx.curExtraction.hierarchyOutlineScore - ctx.prevExtraction.hierarchyOutlineScore,
          },
        }
      : {}),
    ...(ctx?.prevCrawl && ctx?.curCrawl
      ? {
          extraction: {
            prevErrors: ctx.prevCrawl.errorCount,
            curErrors: ctx.curCrawl.errorCount,
            prevPages: ctx.prevCrawl.pageCount,
            curPages: ctx.curCrawl.pageCount,
          },
        }
      : {}),
    ...(ctx?.curCompetitors
      ? {
          competitors: {
            behindCount: ctx.curCompetitors.behindCount,
            gapChanges: [],
          },
        }
      : {}),
  };

  return { alerts, diff };
}

export function serializeMonitoringDiff(diff: MonitoringDiffPayload): string {
  return stringifyJson(diff);
}
