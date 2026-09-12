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
import { fetchSitemapRecursive, discoverSitemaps } from './sitemap';
import { discoverInternalLinks } from './discover-links';
import { mapPool } from '@/lib/map-pool';
import { prioritizePresenceUrls } from '@modules/brand-presence/prioritize-presence-pages';
import { renderPage, type RenderProfile } from './browser/pool';
import { detectBlockedPage } from './blocked-page';
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

async function renderCrawledPage(
  url: string,
  opts: {
    timeoutMs: number;
    screenshot: boolean;
    auditId: string;
    profile?: RenderProfile;
    headless?: boolean;
    waitForSelector?: string;
    blockHeavyResources?: boolean;
  },
): Promise<CrawledPage> {
  const rendered = await renderPage({
    url,
    timeoutMs: opts.timeoutMs,
    screenshot: opts.screenshot,
    profile: opts.profile ?? 'audit',
    headless: opts.headless,
    waitForSelector: opts.waitForSelector,
    blockHeavyResources: opts.blockHeavyResources,
  });
  const screenshotPath = rendered.screenshotBytes
    ? await saveScreenshot(opts.auditId, url, rendered.screenshotBytes)
    : null;

  const blocked = detectBlockedPage({
    statusCode: rendered.statusCode,
    html: rendered.renderedHtml,
    title: rendered.title,
  });

  return {
    url,
    finalUrl: rendered.finalUrl,
    statusCode: rendered.statusCode,
    contentType: 'text/html',
    html: rendered.html,
    renderedHtml: blocked.blocked ? null : rendered.renderedHtml,
    title: rendered.title,
    fetchedAt: new Date().toISOString(),
    durationMs: rendered.durationMs,
    screenshotPath,
    error: blocked.blocked ? blocked.reason : null,
    hydrationDelta: rendered.hydrationDelta,
    performance: blocked.blocked ? null : rendered.performance,
  };
}

export async function crawlSinglePage(
  url: string,
  opts: {
    timeoutMs: number;
    screenshot: boolean;
    auditId: string;
    profile?: RenderProfile;
    waitForSelector?: string;
    blockHeavyResources?: boolean;
  },
): Promise<CrawledPage> {
  const t0 = Date.now();
  try {
    const profile = opts.profile ?? 'audit';
    let page = await renderCrawledPage(url, { ...opts, profile });
    let fetchChannel: CrawledPage['fetchChannel'] = 'stealth';

    const blocked = detectBlockedPage({
      statusCode: page.statusCode,
      html: page.renderedHtml ?? page.html,
      title: page.title,
    });

    if (
      blocked.blocked &&
      config.crawl.headless &&
      config.crawl.retryHeadedOnBlock &&
      profile !== 'discovery'
    ) {
      if (profile === 'off-site') {
        const retryEngine =
          config.presenceProbe.browser === 'cloak'
            ? 'headed CloakBrowser'
            : config.presenceProbe.browser === 'chromium'
              ? 'headed Chromium'
              : 'headed Firefox';
        crawlLogger.info({ url }, `WAF block in headless mode — retrying with ${retryEngine}`);
      } else {
        crawlLogger.info(
          { url, channel: config.crawl.wafRetryChromeChannel },
          'WAF block in headless mode — retrying with system Chrome',
        );
      }
      page = await renderCrawledPage(url, { ...opts, profile, headless: false });
      fetchChannel = 'headed';
    }

    return { ...page, fetchChannel };
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
      performance: null,
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

    const sitemap = await fetchSitemapRecursive(sitemapUrls, {
      maxFiles: config.discovery.maxSitemapFiles,
      maxUrls: config.discovery.maxSitemapUrls,
      maxDepth: 3,
    });

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
    } else if (parsed.maxPages <= 1) {
      additional = [];
    } else {
      opts.onProgress?.(18, 'GEO discovery — ranking pages…');
      const { discoverGeoPages } = await import('@modules/geo-discovery/server');
      const discovery = await discoverGeoPages(parsed.url, (msg) => opts.onProgress?.(20, msg));
      const suggested = discovery.suggestedUrls.filter((u) => u !== rootNorm);
      const candidates = [
        ...sitemap.map((e) => e.loc),
        ...internalLinks,
        ...discovery.pages.map((p) => p.url),
      ];
      additional = prioritizePresenceUrls(
        suggested,
        candidates,
        parsed.url,
        parsed.maxPages - 1,
      );
    }

    const secondaryTimeout = config.crawl.auditSecondaryTimeoutMs;
    const concurrency = config.crawl.auditConcurrency;
    let done = 0;
    const extraPages = await mapPool(additional, concurrency, async (url) => {
      done++;
      opts.onProgress?.(
        25 + Math.round((done / Math.max(1, additional.length)) * 50),
        `Rendering ${url}`,
      );
      return crawlSinglePage(url, {
        timeoutMs: secondaryTimeout,
        screenshot: false,
        auditId: opts.auditId,
        profile: 'audit-secondary',
      });
    });
    pages.push(...extraPages);

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
