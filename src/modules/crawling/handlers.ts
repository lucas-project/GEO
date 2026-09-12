/**
 * Queue handlers for standalone crawl jobs (used by POST /api/crawl).
 */

import 'server-only';

import { randomId } from '@shared/util/id';
import { queue } from '@shared/queue';

export type CrawlJobPayload = {
  url: string;
  maxPages?: number;
  screenshot?: boolean;
  respectRobots?: boolean;
};

export type CrawlJobResult = {
  rootUrl: string;
  pageCount: number;
  sitemapEntryCount: number;
  robots: { fetched: boolean; allowed: boolean; sitemaps: string[] };
  pages: Array<{
    url: string;
    finalUrl: string;
    statusCode: number;
    title: string | null;
    screenshotPath: string | null;
    error: string | null;
    durationMs: number;
  }>;
};

export function registerCrawlHandlers(): void {
  queue.process<CrawlJobPayload, CrawlJobResult>('crawl.run', async (ctx) => {
    const { crawlingService } = await import('./service');
    const auditId = randomId();
    const result = await crawlingService.crawl({
      url: ctx.job.payload.url,
      auditId,
      maxPages: ctx.job.payload.maxPages,
      screenshot: ctx.job.payload.screenshot,
      respectRobots: ctx.job.payload.respectRobots,
      onProgress: async (p, msg) => {
        ctx.log(msg, { progress: p });
        await ctx.reportProgress(p);
      },
    });

    return {
      rootUrl: result.rootUrl,
      pageCount: result.pages.length,
      sitemapEntryCount: result.sitemap.length,
      robots: {
        fetched: result.robots.fetched,
        allowed: result.robots.allowed,
        sitemaps: result.robots.sitemaps,
      },
      pages: result.pages.map((p) => ({
        url: p.url,
        finalUrl: p.finalUrl,
        statusCode: p.statusCode,
        title: p.title,
        screenshotPath: p.screenshotPath,
        error: p.error,
        durationMs: p.durationMs,
      })),
    };
  });
}
