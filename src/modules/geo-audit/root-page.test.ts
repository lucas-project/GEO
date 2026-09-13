import { describe, expect, it } from 'vitest';
import type { CrawledPage } from '@modules/crawling';
import { selectAuditRootPage } from './root-page';

function page(url: string, finalUrl = url, renderedHtml: string | null = '<main>ok</main>'): CrawledPage {
  return {
    url, finalUrl, statusCode: 200, contentType: 'text/html', html: renderedHtml,
    renderedHtml, title: null, fetchedAt: '2026-09-12T00:00:00.000Z', durationMs: 1,
    screenshotPath: null, error: null, hydrationDelta: null,
  };
}

describe('selectAuditRootPage', () => {
  it('chooses the requested entry page even if crawl order changes and it redirects', () => {
    const root = page('https://example.test', 'https://www.example.test/');
    const pricing = page('https://www.example.test/pricing');
    expect(selectAuditRootPage([pricing, root], 'https://example.test')?.url).toBe('https://example.test');
  });

  it('uses a stable homepage fallback before arbitrary discovered pages', () => {
    const product = page('https://example.test/product');
    const homepage = page('https://example.test/');
    expect(selectAuditRootPage([product, homepage], 'https://other.test')?.url).toBe(homepage.url);
  });

  it('uses canonical URL ordering as its final tie breaker', () => {
    const b = page('https://example.test/b');
    const a = page('https://example.test/a');
    expect(selectAuditRootPage([b, a], 'https://other.test')?.url).toBe(a.url);
  });

  it('also chooses a stable root for persisted extraction rows without render fields', () => {
    const rows = [
      { id: 'pricing', url: 'https://example.test/pricing' },
      { id: 'home', url: 'https://example.test/' },
    ];
    expect(selectAuditRootPage(rows, 'https://example.test')?.id).toBe('home');
  });
});
