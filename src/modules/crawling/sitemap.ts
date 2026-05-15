/**
 * Sitemap parser — handles single sitemap.xml and sitemap-index files.
 *
 * Uses cheerio for XML parsing (which it handles well in xmlMode).
 */

import * as cheerio from 'cheerio';
import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import type { SitemapEntry } from './schemas';

const DEFAULT_LIMIT = 200;

export async function fetchSitemap(url: string, limit = DEFAULT_LIMIT): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': config.crawl.userAgent },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseSitemapXml(xml, limit);
  } catch (err) {
    crawlLogger.warn({ err: (err as Error).message, url }, 'sitemap fetch failed');
    return [];
  }
}

export function parseSitemapXml(xml: string, limit: number): SitemapEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries: SitemapEntry[] = [];

  // Standard urlset
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    const lastmod = $(el).find('lastmod').first().text().trim();
    if (loc) entries.push({ loc, lastmod: lastmod || null });
  });

  // Sitemap index — we don't recurse here to avoid runaway crawls; caller
  // can call fetchSitemap on each nested sitemap if needed.
  $('sitemap').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (loc) entries.push({ loc, lastmod: null });
  });

  return entries.slice(0, limit);
}

/**
 * Try common sitemap locations if robots.txt didn't provide one.
 */
export async function discoverSitemaps(rootUrl: string): Promise<string[]> {
  const candidates = [
    new URL('/sitemap.xml', rootUrl).toString(),
    new URL('/sitemap_index.xml', rootUrl).toString(),
    new URL('/sitemap-index.xml', rootUrl).toString(),
  ];
  const found: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'user-agent': config.crawl.userAgent },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) found.push(url);
    } catch {
      // ignore individual failures
    }
  }
  return found;
}
