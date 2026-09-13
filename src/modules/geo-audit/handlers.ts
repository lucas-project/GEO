/**
 * Queue handlers for the geo-audit module.
 *
 * Each module that produces async work exposes a `registerXxxHandlers()`
 * function called by the worker entry. Module handlers MUST NOT import
 * other modules' internals — only their public service surfaces.
 */

import 'server-only';

import { queue } from '@shared/queue';

export function registerGeoAuditHandlers(): void {
  queue.process<
    {
      url: string;
      pageUrls?: string[];
      maxPages?: number;
      recheckOptimizationId?: string;
      pageRankings?: import('./page-inventory').PagePriorityHint[];
    },
    { auditId: string }
  >('geo-audit.run', async (ctx) => {
    const { runAudit } = await import('./service');
    const result = await runAudit({
      url: ctx.job.payload.url,
      pageUrls: ctx.job.payload.pageUrls,
      maxPages: ctx.job.payload.maxPages,
      pageRankings: ctx.job.payload.pageRankings,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });
    if (ctx.job.payload.recheckOptimizationId) {
      const { prisma } = await import('@shared/database/client');
      await prisma.optimizationSuggestion.update({ where: { id: ctx.job.payload.recheckOptimizationId },
        data: { recheckAuditId: result.id } });
    }
    return { auditId: result.id };
  });

  queue.process<{ auditId: string; pageUrls: string[] }, { auditId: string }>(
    'geo-audit.extend',
    async (ctx) => {
      const { extendAudit } = await import('./service');
      const result = await extendAudit(ctx.job.payload.auditId, ctx.job.payload.pageUrls, async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      });
      return { auditId: result.id };
    },
  );

  queue.process<
    { auditId: string; questionTypes?: { brand?: boolean; discovery?: boolean } },
    { prompts: number; competitors: number }
  >(
    'geo-audit.enrich-suggestions',
    async (ctx) => {
      const { enrichAuditSuggestions } = await import('./enrich-suggestions');
      const result = await enrichAuditSuggestions(ctx.job.payload.auditId, {
        questionTypes: ctx.job.payload.questionTypes,
      });
      await ctx.reportProgress(100, 'Suggestions generated');
      return result;
    },
  );
}
