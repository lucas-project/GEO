/**
 * Queue handlers for the geo-audit module.
 *
 * Each module that produces async work exposes a `registerXxxHandlers()`
 * function called by the worker entry. Module handlers MUST NOT import
 * other modules' internals — only their public service surfaces.
 */

import { queue } from '@shared/queue';
import { runAudit } from './service';

export function registerGeoAuditHandlers(): void {
  queue.process<{ url: string }, { auditId: string }>('geo-audit.run', async (ctx) => {
    const result = await runAudit({
      url: ctx.job.payload.url,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });
    return { auditId: result.id };
  });
}
