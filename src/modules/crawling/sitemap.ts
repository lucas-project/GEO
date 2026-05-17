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

export interface ParsedSitemap {
  urls: SitemapEntry[];
  nestedSitemaps: string[];
}

export function parseSitemapXml(xml: string, limit: number): SitemapEntry[] {
  return parseSitemapXmlDetailed(xml, limit).urls;
}

export function parseSitemapXmlDetailed(xml: string, limit: number): ParsedSitemap {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: SitemapEntry[] = [];
  const nestedSitemaps: string[] = [];

  $('url').each((_, el) => {
    if (urls.length >= limit) return;
    const loc = $(el).find('loc').first().text().trim();
    const lastmod = $(el).find('lastmod').first().text().trim();
    if (loc) urls.push({ loc, lastmod: lastmod || null });
  });

  $('sitemap').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (loc) nestedSitemaps.push(loc);
  });

  return { urls, nestedSitemaps };
}

export interface FetchSitemapRecursiveOptions {
  maxFiles?: number;
  maxUrls?: number;
  maxDepth?: number;
}

/** Recursively fetch sitemap indexes and urlsets with global budgets. */
export async function fetchSitemapRecursive(
  rootUrls: string[],
  opts: FetchSitemapRecursiveOptions = {},
): Promise<SitemapEntry[]> {
  const maxFiles = opts.maxFiles ?? 12;
  const maxUrls = opts.maxUrls ?? 500;
  const maxDepth = opts.maxDepth ?? 3;

  const seenFiles = new Set<string>();
  const byLoc = new Map<string, SitemapEntry>();
  const queue: { url: string; depth: number }[] = rootUrls.map((url) => ({ url, depth: 0 }));

  while (queue.length > 0 && seenFiles.size < maxFiles && byLoc.size < maxUrls) {
    const next = queue.shift()!;
    if (seenFiles.has(next.url) || next.depth > maxDepth) continue;
    seenFiles.add(next.url);

    try {
      const res = await fetch(next.url, {
        headers: { 'user-agent': config.crawl.userAgent },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const remaining = maxUrls - byLoc.size;
      const parsed = parseSitemapXmlDetailed(xml, remaining);

      for (const entry of parsed.urls) {
        if (byLoc.size >= maxUrls) break;
        if (!entry.loc || entry.loc.endsWith('.xml')) continue;
        const existing = byLoc.get(entry.loc);
        if (!existing || isNewer(entry.lastmod, existing.lastmod)) {
          byLoc.set(entry.loc, entry);
        }
      }

      for (const nested of parsed.nestedSitemaps) {
        if (seenFiles.size + queue.length < maxFiles) {
          queue.push({ url: nested, depth: next.depth + 1 });
        }
      }
    } catch (err) {
      crawlLogger.warn({ err: (err as Error).message, url: next.url }, 'sitemap fetch failed');
    }
  }

  return [...byLoc.values()].sort((a, b) => {
    const da = a.lastmod ? Date.parse(a.lastmod) : 0;
    const db = b.lastmod ? Date.parse(b.lastmod) : 0;
    return db - da;
  });
}

function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  if (!Number.isFinite(ta)) return !Number.isFinite(tb) || tb === 0;
  if (!Number.isFinite(tb)) return true;
  return ta > tb;
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
