import { queue } from '@shared/queue';
import { runSimulation } from './service';
import { runSimulationBatch } from './batch';
import { mergeSimulationBatchIntoAudit } from '@modules/geo-audit/merge-simulation-batch';
import { prisma } from '@shared/database/client';

export function registerSimulationHandlers(): void {
  queue.process<
    {
      prompt: string;
      targetBrand?: string;
      targetUrl?: string;
      runsPerPlatform?: number;
      contextAuditId?: string;
    },
    { runId: string }
  >(
    'ai-simulation.run',
    async (ctx) => {
      const result = await runSimulation({
        ...ctx.job.payload,
        onProgress: async (p, msg) => {
          ctx.log(msg, { progress: p });
          await ctx.reportProgress(p);
        },
      });
      return { runId: result.runId };
    },
  );

  queue.process<
    {
      prompts: Array<{ text: string; type?: 'brand' | 'discovery' }>;
      targetBrand?: string;
      targetUrl?: string;
      contextAuditId?: string;
      auditId: string;
    },
    { promptsTested: number; promptsCiting: number; checkedAt: string }
  >('ai-simulation.batch', async (ctx) => {
    const { auditId, ...batchInput } = ctx.job.payload;

    const audit = await prisma.geoAudit.findUnique({
      where: { id: auditId },
      select: { siteId: true },
    });

    const batch = await runSimulationBatch({
      ...batchInput,
      siteId: audit?.siteId ?? undefined,
      shouldAbort: async () => {
        const row = await prisma.job.findUnique({
          where: { id: ctx.job.id },
          select: { status: true },
        });
        return row?.status === 'cancelled';
      },
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });

    await mergeSimulationBatchIntoAudit(auditId, batch);

    return {
      promptsTested: batch.promptsTested,
      promptsCiting: batch.promptsCiting,
      checkedAt: batch.checkedAt,
    };
  });
}
