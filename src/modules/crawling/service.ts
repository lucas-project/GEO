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
import { createHash } from 'node:crypto';
import path from 'path';
import { canonicalPageUrl } from '@/lib/website-url';
import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import { telemetry } from '@shared/telemetry';
import { fetchRobotsPolicy } from './robots';
import { fetchSitemapRecursive, discoverSitemaps } from './sitemap';
import { isAuditablePageUrl } from './url-filters';
import { discoverInternalLinks } from './discover-links';
import { mapPool } from '@/lib/map-pool';
// Focused helper import avoids introducing unrelated barrel dependencies.
// eslint-disable-next-line no-restricted-imports
import { prioritizePresenceUrls } from '@modules/brand-presence/prioritize-presence-pages';
import { renderPage, type RenderProfile } from './browser/pool';
import { detectBlockedPage } from './blocked-page';
import {
  classifyNavigationError,
  detailForBlocked,
  detailForObserved,
  buildAcquisitionDetail,
  type AcquisitionAttempt,
  type FetchChannel,
} from './acquisition';
import {
  type CrawlOptions,
  CrawlOptionsSchema,
  type CrawlResult,
  type CrawledPage,
} from './schemas';
import { safeFetch } from '@shared/network/safe-fetch';

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
    signal?: AbortSignal;
    profile?: RenderProfile;
    headless?: boolean;
    waitForSelector?: string;
    blockHeavyResources?: boolean;
  },
): Promise<CrawledPage> {
  const rendered = await renderPage({
    url,
    signal: opts.signal,
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
  const rawHtml = rendered.html || null;
  const renderedHtml = blocked.blocked ? null : rendered.renderedHtml;

  return {
    url,
    finalUrl: rendered.finalUrl,
    statusCode: rendered.statusCode,
    contentType: 'text/html',
    html: rawHtml,
    renderedHtml,
    title: rendered.title,
    fetchedAt: new Date().toISOString(),
    durationMs: rendered.durationMs,
    screenshotPath,
    error: blocked.blocked ? blocked.reason : null,
    hydrationDelta: rendered.hydrationDelta,
    performance: blocked.blocked ? null : rendered.performance,
    fetchStatus: blocked.blocked ? 'blocked' : 'observed',
    blockReason: blocked.blocked ? blocked.reason : undefined,
    contentHash: rawHtml ? createHash('sha256').update(rawHtml).digest('hex') : undefined,
    htmlTruncated: false,
    rawHtmlAvailable: Boolean(rawHtml),
    renderedHtmlAvailable: Boolean(renderedHtml),
    fetchProfile: opts.profile ?? 'audit',
  };
}

function waitConditionForProfile(profile: RenderProfile): string {
  return profile === 'discovery' ? 'commit' : 'domcontentloaded';
}

async function httpFallbackProbe(
  url: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<{
  ok: boolean;
  statusCode: number;
  finalUrl: string;
  html: string | null;
  title: string | null;
  contentType: string | null;
  elapsedMs: number;
  error?: string;
}> {
  const t0 = Date.now();
  try {
    const response = await safeFetch(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'GEO-AuditBot/1.0 (+https://geo.local)',
        },
        signal: opts.signal,
      },
      { timeoutMs: Math.min(opts.timeoutMs, 15_000), maxBytes: 2 * 1024 * 1024 },
    );
    const contentType = response.headers.get('content-type');
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
      ok: response.ok && Boolean(html?.trim()),
      statusCode: response.status,
      finalUrl: response.url || url,
      html: html || null,
      title: titleMatch?.[1]?.trim() || null,
      contentType,
      elapsedMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: 0,
      finalUrl: url,
      html: null,
      title: null,
      contentType: null,
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function withAcquisitionMeta(
  page: CrawledPage,
  meta: {
    fetchChannel: FetchChannel;
    retryCount: number;
    attempts: AcquisitionAttempt[];
    waitCondition: string;
  },
): CrawledPage {
  if (page.fetchStatus === 'blocked') {
    return {
      ...page,
      fetchChannel: meta.fetchChannel,
      acquisitionDetail: detailForBlocked({
        reason: page.blockReason ?? page.error,
        elapsedMs: page.durationMs,
        httpStatus: page.statusCode || undefined,
        finalUrl: page.finalUrl,
        fetchChannel: meta.fetchChannel,
        retryCount: meta.retryCount,
        attempts: meta.attempts,
      }),
    };
  }
  return {
    ...page,
    fetchChannel: meta.fetchChannel,
    acquisitionDetail: detailForObserved({
      elapsedMs: page.durationMs,
      httpStatus: page.statusCode || undefined,
      finalUrl: page.finalUrl,
      fetchChannel: meta.fetchChannel,
      browserRenderComplete: meta.fetchChannel !== 'http',
      retryCount: meta.retryCount,
      attempts: meta.attempts,
    }),
  };
}

export async function crawlSinglePage(
  url: string,
  opts: {
    timeoutMs: number;
    screenshot: boolean;
    auditId: string;
    signal?: AbortSignal;
    profile?: RenderProfile;
    waitForSelector?: string;
    blockHeavyResources?: boolean;
  },
): Promise<CrawledPage> {
  const t0 = Date.now();
  const profile = opts.profile ?? 'audit';
  const waitCondition = waitConditionForProfile(profile);
  const attempts: AcquisitionAttempt[] = [];
  let retryCount = 0;
  let fetchChannel: FetchChannel = 'stealth';
  let lastError: unknown = null;
  let headedTried = false;

  const recordAttempt = (
    channel: FetchChannel,
    outcome: AcquisitionAttempt['outcome'],
    started: number,
    extra?: Partial<AcquisitionAttempt>,
  ) => {
    attempts.push({
      channel,
      outcome,
      elapsedMs: Date.now() - started,
      ...extra,
    });
  };

  try {
    const stealthStarted = Date.now();
    let page = await renderCrawledPage(url, { ...opts, profile });
    fetchChannel = 'stealth';

    const blocked = detectBlockedPage({
      statusCode: page.statusCode,
      html: page.renderedHtml ?? page.html,
      title: page.title,
    });

    if (blocked.blocked) {
      recordAttempt('stealth', 'failed', stealthStarted, {
        reasonCode: 'waf_block',
        technicalMessage: blocked.reason ?? undefined,
      });

      if (
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
        const headedStarted = Date.now();
        headedTried = true;
        retryCount += 1;
        try {
          page = await renderCrawledPage(url, { ...opts, profile, headless: false });
          fetchChannel = 'headed';
          const stillBlocked = detectBlockedPage({
            statusCode: page.statusCode,
            html: page.renderedHtml ?? page.html,
            title: page.title,
          });
          recordAttempt(
            'headed',
            stillBlocked.blocked ? 'failed' : 'success',
            headedStarted,
            {
              reasonCode: stillBlocked.blocked ? 'waf_block' : 'observed_ok',
              technicalMessage: stillBlocked.reason ?? undefined,
            },
          );
        } catch (headedErr) {
          lastError = headedErr;
          const classified = classifyNavigationError(headedErr);
          recordAttempt('headed', 'failed', headedStarted, {
            reasonCode: classified.reasonCode,
            technicalMessage: classified.technicalMessage,
          });
          throw headedErr;
        }
      }
    } else {
      recordAttempt('stealth', 'success', stealthStarted, { reasonCode: 'observed_ok' });
    }

    return withAcquisitionMeta(page, {
      fetchChannel,
      retryCount,
      attempts,
      waitCondition,
    });
  } catch (err) {
    lastError = err;
    const classified = classifyNavigationError(err);
    if (attempts.length === 0) {
      recordAttempt('stealth', 'failed', t0, {
        reasonCode: classified.reasonCode,
        technicalMessage: classified.technicalMessage,
      });
    }

    crawlLogger.warn(
      { url, err: classified.technicalMessage, reasonCode: classified.reasonCode },
      'page render failed',
    );

    // One headed retry for retryable navigation failures (not already tried via WAF path).
    if (
      !headedTried &&
      config.crawl.headless &&
      config.crawl.retryHeadedOnBlock &&
      profile !== 'discovery' &&
      (classified.fetchStatus === 'timeout' ||
        classified.reasonCode === 'err_failed_unclassified' ||
        classified.reasonCode === 'connection_reset')
    ) {
      const headedStarted = Date.now();
      headedTried = true;
      retryCount += 1;
      try {
        crawlLogger.info({ url }, 'Navigation failure — retrying once headed');
        const page = await renderCrawledPage(url, { ...opts, profile, headless: false });
        fetchChannel = 'headed';
        const blocked = detectBlockedPage({
          statusCode: page.statusCode,
          html: page.renderedHtml ?? page.html,
          title: page.title,
        });
        recordAttempt(
          'headed',
          blocked.blocked ? 'failed' : 'success',
          headedStarted,
          {
            reasonCode: blocked.blocked ? 'waf_block' : 'observed_ok',
            technicalMessage: blocked.reason ?? undefined,
          },
        );
        if (!blocked.blocked) {
          return withAcquisitionMeta(page, {
            fetchChannel,
            retryCount,
            attempts,
            waitCondition,
          });
        }
      } catch (headedErr) {
        lastError = headedErr;
        const headedClassified = classifyNavigationError(headedErr);
        recordAttempt('headed', 'failed', headedStarted, {
          reasonCode: headedClassified.reasonCode,
          technicalMessage: headedClassified.technicalMessage,
        });
      }
    }

    // One short HTTP GET fallback when browser navigation failed.
    const httpStarted = Date.now();
    retryCount += 1;
    const http = await httpFallbackProbe(url, {
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    });

    if (http.ok && http.html) {
      const httpBlocked = detectBlockedPage({
        statusCode: http.statusCode,
        html: http.html,
        title: http.title,
      });
      if (!httpBlocked.blocked) {
        recordAttempt('http', 'success', httpStarted, { reasonCode: 'http_partial_observed' });
        const durationMs = Date.now() - t0;
        return {
          url,
          finalUrl: http.finalUrl,
          statusCode: http.statusCode,
          contentType: http.contentType,
          html: http.html,
          renderedHtml: http.html,
          title: http.title,
          fetchedAt: new Date().toISOString(),
          durationMs,
          screenshotPath: null,
          error: null,
          hydrationDelta: null,
          performance: null,
          fetchChannel: 'http',
          fetchStatus: 'observed',
          contentHash: createHash('sha256').update(http.html).digest('hex'),
          htmlTruncated: false,
          rawHtmlAvailable: true,
          renderedHtmlAvailable: true,
          fetchProfile: profile,
          acquisitionDetail: detailForObserved({
            elapsedMs: durationMs,
            httpStatus: http.statusCode,
            finalUrl: http.finalUrl,
            fetchChannel: 'http',
            browserRenderComplete: false,
            retryCount,
            attempts,
            technicalMessage:
              'Browser render incomplete; content captured via HTTP GET fallback only.',
          }),
        };
      }
      recordAttempt('http', 'failed', httpStarted, {
        reasonCode: 'waf_block',
        technicalMessage: httpBlocked.reason ?? undefined,
      });
    } else {
      const httpClassified = classifyNavigationError(
        http.error ?? `HTTP ${http.statusCode}`,
        { httpStatus: http.statusCode || undefined },
      );
      recordAttempt('http', 'failed', httpStarted, {
        reasonCode: httpClassified.reasonCode,
        technicalMessage: httpClassified.technicalMessage,
      });
    }

    const finalClassified = classifyNavigationError(lastError ?? err, {
      httpStatus: http.statusCode || undefined,
    });
    const durationMs = Date.now() - t0;
    return {
      url,
      finalUrl: url,
      statusCode: http.statusCode || 0,
      contentType: null,
      html: null,
      renderedHtml: null,
      title: null,
      fetchedAt: new Date().toISOString(),
      durationMs,
      screenshotPath: null,
      error: finalClassified.userMessage,
      hydrationDelta: null,
      performance: null,
      fetchChannel,
      fetchStatus: finalClassified.fetchStatus,
      blockReason: finalClassified.technicalMessage,
      rawHtmlAvailable: false,
      renderedHtmlAvailable: false,
      fetchProfile: profile,
      acquisitionDetail: {
        ...buildAcquisitionDetail({
          stage: 'navigation',
          reasonCode: finalClassified.reasonCode,
          technicalMessage: finalClassified.technicalMessage,
          elapsedMs: durationMs,
          httpStatus: http.statusCode || undefined,
          finalUrl: url,
          fetchChannel,
          retryCount,
          waitCondition,
          browserRenderComplete: false,
          attempts,
        }),
        userMessage: finalClassified.userMessage,
        nextAction: finalClassified.nextAction,
      },
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
    const robotsPolicy = await fetchRobotsPolicy(parsed.url);
    const robots = { ...robotsPolicy.info, allowed: robotsPolicy.allows(parsed.url) };
    opts.onProgress?.(15, 'Discovering sitemap…');

    let sitemapUrls = robots.sitemaps;
    if (sitemapUrls.length === 0) sitemapUrls = await discoverSitemaps(parsed.url);

    const sitemap = await fetchSitemapRecursive(sitemapUrls, {
      maxFiles: Math.min(config.discovery.maxSitemapFiles, Math.max(2, parsed.maxPages)),
      maxUrls: Math.min(config.discovery.maxSitemapUrls, Math.max(50, parsed.maxPages * 20)),
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
        if (isAuditablePageUrl(norm)) additional.push(norm);
      }
    } else if (parsed.maxPages <= 1) {
      additional = [];
    } else {
      opts.onProgress?.(18, 'GEO discovery — ranking pages…');
      const { discoverGeoPages } = await import('@modules/geo-discovery/server');
      const discovery = await discoverGeoPages(parsed.url, (msg) => opts.onProgress?.(20, msg), {
        maxPages: parsed.maxPages,
      });
      const suggested = discovery.suggestedUrls.filter((u) => u !== rootNorm);
      const candidates = [
        ...sitemap.map((e) => e.loc),
        ...internalLinks,
        ...discovery.pages.map((p) => p.url),
      ].filter(isAuditablePageUrl);
      additional = prioritizePresenceUrls(
        suggested,
        candidates,
        parsed.url,
        parsed.maxPages - 1,
      );
    }

    if (parsed.respectRobots) {
      const before = additional.length;
      additional = additional.filter((candidate) => robotsPolicy.allows(candidate));
      if (additional.length !== before) {
        log.info({ skipped: before - additional.length }, 'robots.txt excluded secondary crawl pages');
      }
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
