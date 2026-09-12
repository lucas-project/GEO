import { queue } from '@shared/queue';
import { generateGeoContentPack, type GenerateGeoContentResult } from './service';

export function registerGeoContentHandlers(): void {
  queue.process<{ url?: string; auditId?: string }, GenerateGeoContentResult>(
    'geo-content.generate',
    async (ctx) => {
      const { url, auditId } = ctx.job.payload;
      await ctx.reportProgress(5, 'Loading audit and site keywords…');
      const result = await generateGeoContentPack({ url, auditId });
      await ctx.reportProgress(100, 'Content ideas ready');
      return result;
    },
  );
}
