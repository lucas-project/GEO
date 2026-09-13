import 'server-only';

import { parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import type { SimulationBatchResult } from '@modules/ai-simulation';
import { mergeScoringMetaPatch } from './parse-scoring-meta';
import { updateAuditJsonWithRevision } from './revisioned-update';

const mergeLogger = logger.child({ module: 'merge-simulation-batch' });

/** Merge batch simulation results into an audit's scoringMeta (raw JSON patch — survives strict parse drift). */
export async function mergeSimulationBatchIntoAudit(
  auditId: string,
  batch: SimulationBatchResult,
): Promise<void> {
  const newCheck = {
    checkedAt: batch.checkedAt,
    executionMode: batch.executionMode,
    platformModes: batch.platformModes,
    promptsTested: batch.promptsTested,
    promptsCiting: batch.promptsCiting,
    averageVisibilityScore: batch.averageVisibilityScore,
    brandPromptsTested: batch.brandPromptsTested,
    brandLeaderboard: batch.brandLeaderboard,
    domainLeaderboard: batch.domainLeaderboard,
    results: batch.results,
  };

  await updateAuditJsonWithRevision(auditId, (row) => {
    const raw = parseJson<Record<string, unknown>>(row.scoringMeta ?? '{}', {});
    const prevRunCount = Number(raw.simulationRunCount) || 0;
    const prevCheck = raw.simulationVisibilityCheck;
    let history: unknown[] = Array.isArray(raw.simulationVisibilityHistory)
      ? [...raw.simulationVisibilityHistory]
      : [];
    if (prevCheck && typeof prevCheck === 'object') {
      const prevAt = (prevCheck as { checkedAt?: string }).checkedAt;
      if (prevAt && prevAt !== newCheck.checkedAt && !history.some((entry) =>
        entry && typeof entry === 'object' && (entry as { checkedAt?: string }).checkedAt === prevAt,
      )) history = [prevCheck, ...history];
    }
    const scoringMeta = mergeScoringMetaPatch(row.scoringMeta, {
      simulationVisibilityCheck: newCheck,
      simulationVisibilityHistory: history.slice(0, 25),
      simulationRunCount: prevRunCount + batch.results.length,
    });
    return { dimensions: row.dimensions, scoringMeta };
  });

  mergeLogger.info(
    {
      auditId,
      promptsTested: batch.promptsTested,
      promptsCiting: batch.promptsCiting,
    },
    'simulation visibility check saved',
  );
}
