import { queue } from '@shared/queue';

import { runOffSitePresenceProbe } from './server';

import { mergeOffSiteReportIntoAudit, loadAuditEntityPages } from './merge-into-audit';

import type { OffSitePresenceReport } from './schemas';



export function registerOffSitePresenceHandlers(): void {

  queue.process<

    {

      siteUrl: string;

      brandOverride?: string;

      siteKeywords?: string[];

      auditId?: string;

      playwrightEnabled?: boolean;

    },

    { report: OffSitePresenceReport }

  >('off-site-presence.probe', async (ctx) => {

    const { siteUrl, brandOverride, siteKeywords, auditId, playwrightEnabled } =
      ctx.job.payload;



    await ctx.reportProgress(5, 'Starting presence probe…');



    const pages = auditId ? await loadAuditEntityPages(auditId) : undefined;



    const report = await runOffSitePresenceProbe({

      siteUrl,

      brandOverride,

      siteKeywords,

      playwrightEnabled,

      pages,

      onProgress: async ({ progress, message }) => {

        ctx.log(message, { progress });

        await ctx.reportProgress(progress, message);

      },

    });



    if (auditId) {

      ctx.log('Merging results into audit…', { progress: 95 });

      await ctx.reportProgress(95, 'Merging results into audit…');

      await mergeOffSiteReportIntoAudit(auditId, report);

    }



    await ctx.reportProgress(100, 'Complete');

    return { report };

  });

}


