/**
 * Crawl service — public entry point.
 *
 * Pipeline:
 *   1. Fetch + parse robots.txt
 *   2. Discover sitemap entries
 *   3. Render the root page via Playwright
 *   4. Optionally render up to N additional pages from the sitemap
 *
 * Other modules import this through `@modules/crawling`.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { canonicalPageUrl } from '@/lib/website-url';
import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import { telemetry } from '@shared/telemetry';
import { fetchRobots } from './robots';
import { fetchSitemap, discoverSitemaps } from './sitemap';
import { buildCrawlQueue, discoverInternalLinks } from './discover-links';
import { renderPage } from './browser/pool';
import {
  type CrawlOptions,
  CrawlOptionsSchema,
  type CrawlResult,
  type CrawledPage,
} from './schemas';

const SCREENSHOT_DIR = path.join(process.cwd(), 'public', 'screenshots');

async function ensureScreenshotDir(): Promise<void> {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true }).catch(() => {});
}

async function saveScreenshot(auditId: string, url: string, bytes: Buffer): Promise<string> {
  await ensureScreenshotDir();
  const safe = url.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60);
  const fileName = `${auditId}-${safe}.png`;
  const full = path.join(SCREENSHOT_DIR, fileName);
  await fs.writeFile(full, bytes);
  return `/screenshots/${fileName}`;
}

export async function crawlSinglePage(
  url: string,
  opts: { timeoutMs: number; screenshot: boolean; auditId: string },
): Promise<CrawledPage> {
  const t0 = Date.now();
  try {
    const rendered = await renderPage({
      url,
      timeoutMs: opts.timeoutMs,
      screenshot: opts.screenshot,
      scrollToBottom: true,
    });
    const screenshotPath = rendered.screenshotBytes
      ? await saveScreenshot(opts.auditId, url, rendered.screenshotBytes)
      : null;

    return {
      url,
      finalUrl: rendered.finalUrl,
      statusCode: rendered.statusCode,
      contentType: 'text/html',
      html: rendered.html,
      renderedHtml: rendered.renderedHtml,
      title: rendered.title,
      fetchedAt: new Date().toISOString(),
      durationMs: rendered.durationMs,
      screenshotPath,
      error: null,
      hydrationDelta: rendered.hydrationDelta,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    crawlLogger.warn({ url, err: message }, 'page render failed');
    return {
      url,
      finalUrl: url,
      statusCode: 0,
      contentType: null,
      html: null,
      renderedHtml: null,
      title: null,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      screenshotPath: null,
      error: message,
      hydrationDelta: null,
    };
  }
}

export interface CrawlServiceOptions extends Partial<CrawlOptions> {
  auditId: string;
  /** When set, crawl only these URLs (root always included), skipping auto queue. */
  pageUrls?: string[];
  onProgress?: (progress: number, message: string) => void;
}

export async function crawl(opts: CrawlServiceOptions): Promise<CrawlResult> {
  const parsed = CrawlOptionsSchema.parse({
    url: opts.url,
    maxPages: opts.maxPages ?? Math.min(config.crawl.maxPages, 10),
    renderJs: opts.renderJs ?? true,
    screenshot: opts.screenshot ?? true,
    timeoutMs: opts.timeoutMs ?? config.crawl.timeoutMs,
    respectRobots: opts.respectRobots ?? config.crawl.respectRobots,
  });
  const log = crawlLogger.child({ url: parsed.url, auditId: opts.auditId });
  log.info({ opts: parsed }, 'crawl starting');
  opts.onProgress?.(5, 'Fetching robots.txt…');

  const startedAt = new Date().toISOString();

  return telemetry.timed('crawl.run', async () => {
    const robots = await fetchRobots(parsed.url);
    opts.onProgress?.(15, 'Discovering sitemap…');

    let sitemapUrls = robots.sitemaps;
    if (sitemapUrls.length === 0) sitemapUrls = await discoverSitemaps(parsed.url);

    const sitemap = [];
    for (const sm of sitemapUrls.slice(0, 3)) {
      const entries = await fetchSitemap(sm, 50);
      sitemap.push(...entries);
    }

    if (parsed.respectRobots && !robots.allowed) {
      log.warn('robots.txt disallows root URL');
      return {
        rootUrl: parsed.url,
        pages: [],
        robots,
        sitemap,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    opts.onProgress?.(25, 'Rendering root page with Playwright…');
    const pages: CrawledPage[] = [];
    const rootPage = await crawlSinglePage(parsed.url, {
      timeoutMs: parsed.timeoutMs,
      screenshot: parsed.screenshot,
      auditId: opts.auditId,
    });
    pages.push(rootPage);

    const internalLinks =
      rootPage.renderedHtml && parsed.maxPages > 1
        ? discoverInternalLinks(rootPage.renderedHtml, parsed.url, 40)
        : [];

    const rootNorm = canonicalPageUrl(rootPage.finalUrl || parsed.url, parsed.url);
    let additional: string[];

    if (opts.pageUrls?.length) {
      const seen = new Set<string>([rootNorm]);
      additional = [];
      for (const raw of opts.pageUrls) {
        if (additional.length >= parsed.maxPages - 1) break;
        const norm = canonicalPageUrl(raw, parsed.url);
        if (seen.has(norm)) continue;
        seen.add(norm);
        additional.push(norm);
      }
    } else {
      additional = buildCrawlQueue(
        parsed.url,
        sitemap.map((e) => e.loc),
        internalLinks,
        parsed.maxPages,
      );
    }

    let i = 0;
    for (const url of additional) {
      opts.onProgress?.(
        25 + Math.round(((i + 1) / Math.max(1, additional.length)) * 50),
        `Rendering ${url}`,
      );
      const page = await crawlSinglePage(url, {
        timeoutMs: parsed.timeoutMs,
        screenshot: false,
        auditId: opts.auditId,
      });
      pages.push(page);
      i++;
    }

    const finishedAt = new Date().toISOString();
    log.info(
      { pageCount: pages.length, sitemapEntries: sitemap.length, internalLinks: internalLinks.length },
      'crawl complete',
    );
    return { rootUrl: parsed.url, pages, robots, sitemap, startedAt, finishedAt };
  });
}

export const crawlingService = {
  crawl,
};
