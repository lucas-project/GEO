import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderPage, safeFetch } = vi.hoisted(() => ({
  renderPage: vi.fn(),
  safeFetch: vi.fn(),
}));

vi.mock('./browser/pool', () => ({ renderPage }));
vi.mock('@shared/network/safe-fetch', () => ({ safeFetch }));
vi.mock('@shared/logger', () => ({
  crawlLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@shared/config', () => ({
  config: {
    crawl: {
      headless: true,
      retryHeadedOnBlock: true,
      useStealth: true,
      wafRetryChromeChannel: 'chrome',
    },
    presenceProbe: { browser: 'chromium' },
  },
}));

import { crawlSinglePage } from './service';

const deniedHtml = `<html><head><title>Access Denied</title></head><body>Access Denied</body></html>`;
const okHtml = `<html><head><title>Tesla</title></head><body>${'content '.repeat(200)}</body></html>`;

function mockRender(statusCode: number, title: string, html: string) {
  return {
    finalUrl: 'https://www.tesla.com/',
    statusCode,
    html,
    renderedHtml: html,
    title,
    screenshotBytes: null,
    durationMs: 100,
    hydrationDelta: { addedTextChars: 0, addedNodes: 0 },
    performance: { lcpMs: null, mobileBodyTextLength: null },
  };
}

describe('crawlSinglePage headed retry', () => {
  beforeEach(() => {
    renderPage.mockReset();
    safeFetch.mockReset();
  });

  it('retries with headless false (system Chrome path) when first render is blocked', async () => {
    renderPage
      .mockResolvedValueOnce(mockRender(403, 'Access Denied', deniedHtml))
      .mockResolvedValueOnce(mockRender(200, 'Tesla', okHtml));

    const page = await crawlSinglePage('https://www.tesla.com/', {
      timeoutMs: 5000,
      screenshot: false,
      auditId: 'test',
    });

    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(renderPage.mock.calls[0][0].headless).toBeUndefined();
    expect(renderPage.mock.calls[1][0].headless).toBe(false);
    expect(page.renderedHtml).toContain('Tesla');
    expect(page.error).toBeNull();
    expect(page.acquisitionDetail?.reasonCode).toBe('observed_ok');
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('does not retry when first render succeeds', async () => {
    renderPage.mockResolvedValueOnce(mockRender(200, 'Tesla', okHtml));

    await crawlSinglePage('https://www.tesla.com/', {
      timeoutMs: 5000,
      screenshot: false,
      auditId: 'test',
    });

    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('classifies navigation timeout and tries headed then HTTP fallback', async () => {
    renderPage
      .mockRejectedValueOnce(new Error('Timeout 30000ms exceeded'))
      .mockRejectedValueOnce(new Error('Timeout 30000ms exceeded'));
    safeFetch.mockResolvedValueOnce(
      new Response(okHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const page = await crawlSinglePage('https://www.tesla.com/', {
      timeoutMs: 5000,
      screenshot: false,
      auditId: 'test',
    });

    expect(page.fetchStatus).toBe('observed');
    expect(page.fetchChannel).toBe('http');
    expect(page.acquisitionDetail?.reasonCode).toBe('http_partial_observed');
    expect(page.acquisitionDetail?.userMessage).not.toMatch(/ERR_FAILED|legacy_unknown/i);
  });

  it('returns classified unreachable when browser and HTTP fail', async () => {
    renderPage.mockRejectedValue(new Error('net::ERR_FAILED'));
    safeFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const page = await crawlSinglePage('https://www.tesla.com/', {
      timeoutMs: 5000,
      screenshot: false,
      auditId: 'test',
    });

    expect(page.fetchStatus).toBe('unreachable');
    expect(page.acquisitionDetail?.reasonCode).toBe('err_failed_unclassified');
    expect(page.error).not.toMatch(/ERR_FAILED/);
    expect(page.acquisitionDetail?.technicalMessage).toContain('ERR_FAILED');
  });
});
