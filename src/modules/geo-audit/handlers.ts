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
      ownerId?: string;
      pageUrls?: string[];
      maxPages?: number;
      recheckOptimizationId?: string;
      pageRankings?: import('./page-inventory').PagePriorityHint[];
    },
    { auditId: string; completion?: 'complete' | 'partial'; stopReason?: string }
  >('geo-audit.run', async (ctx) => {
    const { runAudit } = await import('./service');
    const result = await runAudit({
      url: ctx.job.payload.url,
      ownerId: ctx.job.payload.ownerId,
      pageUrls: ctx.job.payload.pageUrls,
      maxPages: ctx.job.payload.maxPages,
      pageRankings: ctx.job.payload.pageRankings,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });
    if (ctx.budget?.stopReason) {
      const { prisma, parseJson, stringifyJson } = await import('@shared/database/client');
      const audit = await prisma.geoAudit.findUnique({ where: { id: result.id }, select: { scoringMeta: true } });
      const current = parseJson<Record<string, unknown>>(audit?.scoringMeta ?? '{}', {});
      await prisma.geoAudit.update({
        where: { id: result.id },
        data: {
          status: 'partial',
          scoringMeta: stringifyJson({
            ...current,
            completion: 'partial',
            stopReason: ctx.budget.stopReason,
            sampleCoverageStatus:
              current.sampleCoverageStatus === 'ready' ? 'partial' : current.sampleCoverageStatus,
          }),
        },
      });
    }
    if (ctx.job.payload.recheckOptimizationId) {
      const { prisma } = await import('@shared/database/client');
      await prisma.optimizationSuggestion.update({ where: { id: ctx.job.payload.recheckOptimizationId },
        data: { recheckAuditId: result.id } });
    }
    return {
      auditId: result.id,
      ...(ctx.budget?.stopReason || result.status === 'partial'
        ? { completion: 'partial' as const, stopReason: ctx.budget?.stopReason ?? result.scoringMeta?.stopReason }
        : { completion: 'complete' as const }),
    };
  });

  queue.process<{ auditId: string; pageUrls: string[] }, { auditId: string; extension: { observed: number; failed: number; skipped: Array<{ url: string; reason: string }> } }>(
    'geo-audit.extend',
    async (ctx) => {
      const { extendAudit } = await import('./service');
      const result = await extendAudit(ctx.job.payload.auditId, ctx.job.payload.pageUrls, async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      });
      return { auditId: result.id, extension: result.extension };
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
