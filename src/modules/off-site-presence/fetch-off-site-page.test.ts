import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@modules/crawling/server', () => ({
  crawlSinglePage: vi.fn(),
}));

vi.mock('@shared/config', () => ({
  config: {
    presenceProbe: { timeoutMs: 28_000, browser: 'chromium' },
    crawl: { browserUserAgent: 'TestAgent/1.0' },
  },
}));

import { crawlSinglePage } from '@modules/crawling/server';
import { createFetchPage } from './fetch-off-site-page';

describe('createFetchPage', () => {
  beforeEach(() => {
    vi.mocked(crawlSinglePage).mockReset();
  });

  it('maps stealth crawl to playwright-stealth', async () => {
    vi.mocked(crawlSinglePage).mockResolvedValue({
      url: 'https://example.com', finalUrl: 'https://example.com', statusCode: 200,
      contentType: 'text/html', html: '<html>ok</html>', renderedHtml: '<html>ok</html>',
      title: 'OK', fetchedAt: new Date().toISOString(), durationMs: 100, screenshotPath: null,
      error: null, hydrationDelta: null, performance: null, fetchChannel: 'stealth', fetchStatus: 'observed',
    });

    const page = await createFetchPage(true)('https://example.com');
    expect(page.fetchMethod).toBe('playwright-stealth');
    expect(page.html).toContain('ok');
    expect(page.observationStatus).toBe('observed');
  });

  it('maps headed retry to playwright-headed', async () => {
    vi.mocked(crawlSinglePage).mockResolvedValue({
      url: 'https://g2.com', finalUrl: 'https://g2.com', statusCode: 200,
      contentType: 'text/html', html: '<html>g2</html>', renderedHtml: '<html>g2</html>',
      title: 'G2', fetchedAt: new Date().toISOString(), durationMs: 200, screenshotPath: null,
      error: null, hydrationDelta: null, performance: null, fetchChannel: 'headed', fetchStatus: 'observed',
    });

    const page = await createFetchPage(true)('https://g2.com');
    expect(page.fetchMethod).toBe('playwright-headed');
  });

  it('preserves blocked status instead of returning a zero-hit observation', async () => {
    vi.mocked(crawlSinglePage).mockResolvedValue({
      url: 'https://blocked.com', finalUrl: 'https://blocked.com', statusCode: 403,
      contentType: 'text/html', html: '<html>denied</html>', renderedHtml: null,
      title: 'Access Denied', fetchedAt: new Date().toISOString(), durationMs: 50,
      screenshotPath: null, error: 'blocked', hydrationDelta: null, performance: null,
      fetchChannel: 'stealth', fetchStatus: 'blocked', blockReason: 'blocked',
    });

    const page = await createFetchPage(true)('https://blocked.com');
    expect(page.html).toBe('');
    expect(page.statusCode).toBe(403);
    expect(page.observationStatus).toBe('blocked');
    expect(page.blockReason).toBe('blocked');
  });
});
