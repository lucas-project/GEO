import { describe, expect, it } from 'vitest';
import { parseSitemapXmlDetailed } from './sitemap';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2025-01-01</lastmod></url>
  <url><loc>https://example.com/faq</loc></url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;

describe('parseSitemapXmlDetailed', () => {
  it('parses url entries', () => {
    const { urls, nestedSitemaps } = parseSitemapXmlDetailed(URLSET, 50);
    expect(urls).toHaveLength(2);
    expect(urls[0]?.loc).toBe('https://example.com/');
    expect(nestedSitemaps).toHaveLength(0);
  });

  it('parses sitemap index nested locs', () => {
    const { urls, nestedSitemaps } = parseSitemapXmlDetailed(INDEX, 50);
    expect(urls).toHaveLength(0);
    expect(nestedSitemaps).toEqual(['https://example.com/sitemap-pages.xml']);
  });
});
