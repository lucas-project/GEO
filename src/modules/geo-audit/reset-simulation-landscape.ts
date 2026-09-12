import 'server-only';

import { prisma, parseJson } from '@shared/database/client';
import { mergeScoringMetaPatch } from './parse-scoring-meta';

/** Clear discovery market landscape (brand/domain leaderboards) on the saved visibility check. */
export async function resetSimulationMarketLandscape(auditId: string): Promise<void> {
  const row = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { scoringMeta: true },
  });
  if (!row) {
    throw new Error(`Audit not found: ${auditId}`);
  }

  const raw = parseJson<Record<string, unknown>>(row.scoringMeta ?? '{}', {});
  const check = raw.simulationVisibilityCheck;
  if (!check || typeof check !== 'object') {
    throw new Error('No visibility check on this audit');
  }

  const nextCheck = {
    ...(check as Record<string, unknown>),
    brandLeaderboard: [],
    domainLeaderboard: [],
  };

  const nextMeta = mergeScoringMetaPatch(row.scoringMeta, {
    simulationVisibilityCheck: nextCheck,
  });

  await prisma.geoAudit.update({
    where: { id: auditId },
    data: { scoringMeta: nextMeta },
  });
}
