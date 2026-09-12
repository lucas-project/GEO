import 'server-only';

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import type { SimulationBatchResult } from '@modules/ai-simulation/batch';
import { mergeScoringMetaPatch } from './parse-scoring-meta';

const mergeLogger = logger.child({ module: 'merge-simulation-batch' });

/** Merge batch simulation results into an audit's scoringMeta (raw JSON patch — survives strict parse drift). */
export async function mergeSimulationBatchIntoAudit(
  auditId: string,
  batch: SimulationBatchResult,
): Promise<void> {
  const row = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { scoringMeta: true },
  });
  if (!row) {
    throw new Error(`Audit not found: ${auditId}`);
  }

  const raw = parseJson<Record<string, unknown>>(row.scoringMeta ?? '{}', {});
  const prevRunCount = Number(raw.simulationRunCount) || 0;

  const newCheck = {
    checkedAt: batch.checkedAt,
    promptsTested: batch.promptsTested,
    promptsCiting: batch.promptsCiting,
    averageVisibilityScore: batch.averageVisibilityScore,
    brandPromptsTested: batch.brandPromptsTested,
    brandLeaderboard: batch.brandLeaderboard,
    domainLeaderboard: batch.domainLeaderboard,
    results: batch.results,
  };

  const prevCheck = raw.simulationVisibilityCheck;
  let history: unknown[] = Array.isArray(raw.simulationVisibilityHistory)
    ? [...raw.simulationVisibilityHistory]
    : [];

  if (prevCheck && typeof prevCheck === 'object') {
    const prevAt = (prevCheck as { checkedAt?: string }).checkedAt;
    if (
      prevAt &&
      prevAt !== newCheck.checkedAt &&
      !history.some(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          (entry as { checkedAt?: string }).checkedAt === prevAt,
      )
    ) {
      history = [prevCheck, ...history];
    }
  }

  const MAX_HISTORY = 25;
  history = history.slice(0, MAX_HISTORY);

  const nextMeta = mergeScoringMetaPatch(row.scoringMeta, {
    simulationVisibilityCheck: newCheck,
    simulationVisibilityHistory: history,
    simulationRunCount: prevRunCount + batch.results.length,
  });

  await prisma.geoAudit.update({
    where: { id: auditId },
    data: { scoringMeta: nextMeta },
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
