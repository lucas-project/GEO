import { queue } from '@shared/queue';
import {
  ingestAudit,
  ingestAuditEmbeddings,
  reindexPatterns,
  backfillIntelligenceFromAudits,
} from './ingest';

export interface IntelligenceIngestPayload {
  auditId: string;
  embeddingsOnly?: boolean;
}

export function registerIntelligenceHandlers(): void {
  queue.process<IntelligenceIngestPayload, { ok: true }>(
    'intelligence.ingest',
    async (ctx) => {
      const { auditId, embeddingsOnly } = ctx.job.payload;
      if (embeddingsOnly) {
        await ingestAuditEmbeddings(auditId);
      } else {
        await ingestAudit(auditId);
      }
      return { ok: true };
    },
  );

  queue.process<unknown, { patternsUpdated: number }>('intelligence.reindex', async () => {
    return reindexPatterns();
  });

  queue.process<unknown, { patternsUpdated: number }>('intelligence.reindex-cohorts', async () => {
    return reindexPatterns();
  });

  queue.process<unknown, { processed: number; skipped: number }>(
    'intelligence.backfill',
    async () => backfillIntelligenceFromAudits({ reindexEmbeddings: true }),
  );
}
