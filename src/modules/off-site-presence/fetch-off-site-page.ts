import { config } from '@shared/config';
import { crawlSinglePage } from '@modules/crawling/server';
import type { FetchPageFn, FetchPageOptions, FetchedPage } from './platforms/types';

export type OffSiteFetchMethod = FetchedPage['fetchMethod'];

function mapFetchChannel(
  channel: 'stealth' | 'headed' | undefined,
): OffSiteFetchMethod {
  if (channel === 'headed') return 'playwright-headed';
  if (config.presenceProbe.browser === 'cloak') return 'playwright-cloak';
  return 'playwright-stealth';
}

async function fetchHttp(url: string, timeoutMs?: number): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': config.crawl.browserUserAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs ?? config.presenceProbe.timeoutMs),
  });
  const html = await res.text();
  return {
    html,
    statusCode: res.status,
    finalUrl: res.url || url,
    fetchMethod: 'http',
  };
}

export function createFetchPage(playwrightEnabled: boolean): FetchPageFn {
  if (!playwrightEnabled) {
    return async (url: string) => fetchHttp(url);
  }

  return async (url: string, options?: FetchPageOptions): Promise<FetchedPage> => {
    const page = await crawlSinglePage(url, {
      profile: 'off-site',
      timeoutMs: config.presenceProbe.timeoutMs,
      screenshot: false,
      auditId: 'presence-probe',
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
