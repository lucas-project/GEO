import { queue } from '@shared/queue';
import { runComparison } from './service';

export function registerCompetitorHandlers(): void {
  queue.process<
    { targetUrl: string; competitorUrls: string[] },
    { comparisonId: string; targetUrl: string }
  >('competitor.compare', async (ctx) => {
    const result = await runComparison({
      targetUrl: ctx.job.payload.targetUrl,
      competitorUrls: ctx.job.payload.competitorUrls,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });
    return { comparisonId: result.id, targetUrl: result.target.url };
  });
}
