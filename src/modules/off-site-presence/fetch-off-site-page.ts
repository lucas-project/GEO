import { config } from '@shared/config';
import { safeFetch } from '@shared/network/safe-fetch';
import { crawlSinglePage } from '@modules/crawling/server';
import type { FetchPageFn, FetchPageOptions, FetchedPage } from './platforms/types';
import { classifyHttpObservation } from './fetch-observation';

export type OffSiteFetchMethod = FetchedPage['fetchMethod'];

function mapFetchChannel(
  channel: 'stealth' | 'headed' | 'http' | undefined,
): OffSiteFetchMethod {
  if (channel === 'http') return 'http';
  if (channel === 'headed') return 'playwright-headed';
  if (config.presenceProbe.browser === 'cloak') return 'playwright-cloak';
  return 'playwright-stealth';
}

async function fetchHttp(url: string, timeoutMs?: number, signal?: AbortSignal): Promise<FetchedPage> {
  const res = await safeFetch(url, {
    headers: {
      'User-Agent': config.crawl.browserUserAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs ?? config.presenceProbe.timeoutMs)])
      : AbortSignal.timeout(timeoutMs ?? config.presenceProbe.timeoutMs),
  });
  const html = await res.text();
  const observation = classifyHttpObservation(res.status, html);
  return {
    html,
    statusCode: res.status,
    finalUrl: res.url || url,
    fetchMethod: 'http',
    observationStatus: observation.status,
    ...(observation.blockReason ? { blockReason: observation.blockReason } : {}),
  };
}

export function createFetchPage(playwrightEnabled: boolean): FetchPageFn {
  if (!playwrightEnabled) {
    return async (url: string, options?: FetchPageOptions) => fetchHttp(url, undefined, options?.signal);
  }

  return async (url: string, options?: FetchPageOptions): Promise<FetchedPage> => {
    if (options?.httpOnly) return fetchHttp(url, undefined, options.signal);
    const page = await crawlSinglePage(url, {
      profile: 'off-site',
      timeoutMs: config.presenceProbe.timeoutMs,
      screenshot: false,
      auditId: 'presence-probe',
      signal: options?.signal,
      waitForSelector: options?.waitForSelector,
      blockHeavyResources: options?.blockHeavyResources,
    });

    const html = page.renderedHtml ?? '';
    return {
      html,
      statusCode: page.statusCode,
      finalUrl: page.finalUrl || url,
      fetchMethod: mapFetchChannel(page.fetchChannel),
      title: page.title,
      observationStatus:
        page.fetchStatus === 'blocked'
          ? 'blocked'
          : page.fetchStatus === 'timeout'
            ? 'timeout'
            : page.statusCode === 429
              ? 'rate_limited'
              : page.statusCode >= 400
                ? 'unreachable'
                : page.renderedHtml
                  ? 'observed'
                  : 'parse_error',
      blockReason: page.blockReason,
    };
  };
}

/** Plain HTTP fetch for adapters that want a fast path before Playwright. */
export async function fetchOffSiteHttp(
  url: string,
  timeoutMs = config.presenceProbe.serpTimeoutMs,
): Promise<FetchedPage> {
  return fetchHttp(url, timeoutMs);
}
