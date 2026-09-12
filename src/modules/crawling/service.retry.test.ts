import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderPage } = vi.hoisted(() => ({
  renderPage: vi.fn(),
}));

vi.mock('./browser/pool', () => ({ renderPage }));
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
  });

  it('does not retry when first render succeeds', async () => {
    renderPage.mockResolvedValueOnce(mockRender(200, 'Tesla', okHtml));

    await crawlSinglePage('https://www.tesla.com/', {
      timeoutMs: 5000,
      screenshot: false,
      auditId: 'test',
    });

    expect(renderPage).toHaveBeenCalledTimes(1);
  });
});
