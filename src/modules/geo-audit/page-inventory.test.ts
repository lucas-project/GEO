import { describe, expect, it } from 'vitest';
import { applyGeoPriorityToInventory, buildPageInventory } from './page-inventory';
import type { CrawlResult } from '@modules/crawling';

function minimalCrawl(rootUrl: string, extraUrls: string[] = []): CrawlResult {
  return {
    rootUrl,
    pages: [
      {
        url: rootUrl,
        finalUrl: rootUrl,
        statusCode: 200,
        contentType: 'text/html',
        html: '<html></html>',
        renderedHtml: '<html></html>',
        title: 'Home',
        fetchedAt: new Date().toISOString(),
        durationMs: 1,
        screenshotPath: null,
        error: null,
        hydrationDelta: null,
      },
    ],
    robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
    sitemap: extraUrls.map((loc) => ({ loc, lastmod: null })),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

describe('applyGeoPriorityToInventory', () => {
  it('uses discovery hints when provided', () => {
    const root = 'https://example.com';
    const inventory = buildPageInventory({
      rootUrl: root,
      crawl: minimalCrawl(root, ['https://example.com/faq']),
      internalLinks: [],
      auditedUrls: new Set([root]),
    });

    const enriched = applyGeoPriorityToInventory(inventory, root, [
      { url: 'https://example.com/faq', geoScore: 88, probed: true },
    ]);

    const faq = enriched.pages.find((p) => p.url.includes('/faq'));
    expect(faq?.geoScore).toBe(88);
    expect(faq?.probed).toBe(true);
  });

  it('assigns heuristic priority when hints are missing', () => {
    const root = 'https://example.com';
    const inventory = buildPageInventory({
      rootUrl: root,
      crawl: minimalCrawl(root, ['https://example.com/faq']),
      internalLinks: [],
      auditedUrls: new Set([root]),
    });

    const enriched = applyGeoPriorityToInventory(inventory, root);
    const faq = enriched.pages.find((p) => p.url.includes('/faq'));
    expect(faq?.geoScore).toBeGreaterThan(0);
  });
});
