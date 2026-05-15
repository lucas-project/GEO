/**
 * Discover same-origin internal links from rendered HTML for multi-page audits.
 */

import * as cheerio from 'cheerio';
import { canonicalPageUrl, normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';

const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|webp|svg|ico|css|js|xml|mp4|mp3|woff2?|ttf|eot)(\?|$)/i;
const SKIP_PATH = /\/(wp-admin|wp-json|cart|checkout|login|signup|account)(\/|$)/i;

function normalizeInternal(href: string, siteRoot: string): string | null {
  try {
    if (!sameTargetSite(href, siteRoot)) return null;
    const norm = canonicalPageUrl(href, siteRoot);
    const path = new URL(norm).pathname;
    if (SKIP_EXT.test(path) || SKIP_PATH.test(path)) return null;
    return norm;
  } catch {
    return null;
  }
}

/** Pull internal links from HTML, ranked by likely importance. */
export function discoverInternalLinks(html: string, baseUrl: string, limit = 60): string[] {
  const siteRoot = normalizeWebsiteUrl(baseUrl);
  const $ = cheerio.load(html);
  const scored = new Map<string, number>();

  const bump = (href: string, weight: number) => {
    const norm = normalizeInternal(href, siteRoot);
    if (!norm) return;
    scored.set(norm, (scored.get(norm) ?? 0) + weight);
  };

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const text = $(el).text().trim().toLowerCase();
    let weight = 1;
    if ($(el).closest('nav, header, footer, [role="navigation"]').length) weight = 4;
    if (text.length > 2 && text.length < 80) weight += 1;
    bump(href, weight);
  });

  const rootNorm = normalizeInternal(siteRoot, siteRoot);
  if (rootNorm) scored.delete(rootNorm);

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, limit);
}

/** Merge internal links and sitemap URLs; internal nav first, deduped, same site only. */
export function buildCrawlQueue(
  rootUrl: string,
  sitemapLocs: string[],
  internalLinks: string[],
  maxPages: number,
): string[] {
  const siteRoot = normalizeWebsiteUrl(rootUrl);
  const seen = new Set<string>([canonicalPageUrl(siteRoot, siteRoot)]);
  const queue: string[] = [];

  const add = (raw: string) => {
    if (queue.length >= maxPages - 1) return;
    if (!raw || raw.endsWith('.xml')) return;
    if (!sameTargetSite(raw, siteRoot)) return;
    const norm = canonicalPageUrl(raw, siteRoot);
    if (seen.has(norm)) return;
    seen.add(norm);
    queue.push(norm);
  };

  for (const link of internalLinks) add(link);
  for (const loc of sitemapLocs) add(loc);

  return queue;
}
