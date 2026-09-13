import 'server-only';

import { parseJson } from '@shared/database/client';
import { mergeScoringMetaPatch } from './parse-scoring-meta';
import { updateAuditJsonWithRevision } from './revisioned-update';

/** Clear discovery market landscape (brand/domain leaderboards) on the saved visibility check. */
export async function resetSimulationMarketLandscape(auditId: string): Promise<void> {
  await updateAuditJsonWithRevision(auditId, (row) => {
    const raw = parseJson<Record<string, unknown>>(row.scoringMeta ?? '{}', {});
    const check = raw.simulationVisibilityCheck;
    if (!check || typeof check !== 'object') throw new Error('No visibility check on this audit');
    return {
      dimensions: row.dimensions,
      scoringMeta: mergeScoringMetaPatch(row.scoringMeta, {
        simulationVisibilityCheck: { ...(check as Record<string, unknown>), brandLeaderboard: [], domainLeaderboard: [] },
      }),
    };
  });
}
