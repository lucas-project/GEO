/**
 * Queue handlers for the geo-audit module.
 *
 * Each module that produces async work exposes a `registerXxxHandlers()`
 * function called by the worker entry. Module handlers MUST NOT import
 * other modules' internals — only their public service surfaces.
 */

import { queue } from '@shared/queue';
import { extendAudit, runAudit } from './service';

export function registerGeoAuditHandlers(): void {
  queue.process<
    { url: string; pageUrls?: string[]; maxPages?: number },
    { auditId: string }
  >('geo-audit.run', async (ctx) => {
    const result = await runAudit({
      url: ctx.job.payload.url,
      pageUrls: ctx.job.payload.pageUrls,
      maxPages: ctx.job.payload.maxPages,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });
    return { auditId: result.id };
  });

  queue.process<{ auditId: string; pageUrls: string[] }, { auditId: string }>(
    'geo-audit.extend',
    async (ctx) => {
      const result = await extendAudit(ctx.job.payload.auditId, ctx.job.payload.pageUrls, async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      });
      return { auditId: result.id };
    },
  );
}
