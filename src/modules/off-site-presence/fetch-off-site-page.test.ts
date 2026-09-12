import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@modules/crawling/server', () => ({
  crawlSinglePage: vi.fn(),
}));

vi.mock('@shared/config', () => ({
  config: {
    presenceProbe: { timeoutMs: 28_000 },
    crawl: {
      browserUserAgent: 'TestAgent/1.0',
    },
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
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      contentType: 'text/html',
      html: '<html>ok</html>',
      renderedHtml: '<html>ok</html>',
      title: 'OK',
      fetchedAt: new Date().toISOString(),
      durationMs: 100,
      screenshotPath: null,
      error: null,
      hydrationDelta: null,
      performance: null,
      fetchChannel: 'stealth',
    });

    const fetchPage = createFetchPage(true);
    const page = await fetchPage('https://example.com');
    expect(page.fetchMethod).toBe('playwright-stealth');
    expect(page.html).toContain('ok');
  });

  it('maps headed retry to playwright-headed', async () => {
    vi.mocked(crawlSinglePage).mockResolvedValue({
      url: 'https://g2.com',
      finalUrl: 'https://g2.com',
      statusCode: 200,
      contentType: 'text/html',
      html: '<html>g2</html>',
      renderedHtml: '<html>g2</html>',
      title: 'G2',
      fetchedAt: new Date().toISOString(),
      durationMs: 200,
      screenshotPath: null,
      error: null,
      hydrationDelta: null,
      performance: null,
      fetchChannel: 'headed',
    });

    const fetchPage = createFetchPage(true);
    const page = await fetchPage('https://g2.com');
    expect(page.fetchMethod).toBe('playwright-headed');
  });

  it('returns empty html when crawl is blocked', async () => {
    vi.mocked(crawlSinglePage).mockResolvedValue({
      url: 'https://blocked.com',
      finalUrl: 'https://blocked.com',
      statusCode: 403,
      contentType: 'text/html',
      html: '<html>denied</html>',
      renderedHtml: null,
      title: 'Access Denied',
      fetchedAt: new Date().toISOString(),
      durationMs: 50,
      screenshotPath: null,
      error: 'blocked',
      hydrationDelta: null,
      performance: null,
      fetchChannel: 'stealth',
    });

    const fetchPage = createFetchPage(true);
    const page = await fetchPage('https://blocked.com');
    expect(page.html).toBe('');
    expect(page.statusCode).toBe(403);
  });
});
