/**
 * Enhanced navigation link discovery with region weights and anchor text.
 */

import * as cheerio from 'cheerio';
import { canonicalPageUrl, normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';

const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|webp|svg|ico|css|js|xml|mp4|mp3|woff2?|ttf|eot)(\?|$)/i;
const SKIP_PATH = /\/(wp-admin|wp-json|cart|checkout|login|signup|account)(\/|$)/i;

export interface NavLinkHit {
  url: string;
  weight: number;
  anchorText: string;
}

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

function regionWeight($: cheerio.CheerioAPI, el: Parameters<typeof $>[0]): number {
  const $el = $(el as never);
  if ($el.closest('nav, [role="navigation"]').length) return 5;
  if ($el.closest('header').length) return 4;
  if ($el.closest('.menu, .sidebar, [class*="sidebar"], [class*="menu"]').length) return 4;
  if ($el.closest('[role="breadcrumb"], .breadcrumb, nav[aria-label*="breadcrumb" i]').length)
    return 3;
  if ($el.closest('footer').length) return 2;
  if ($el.closest('main, article, [role="main"]').length) return 2;
  return 1;
}

/** Pull internal links from HTML with nav region weights and anchor text. */
export function discoverNavLinks(html: string, baseUrl: string, limit = 120): NavLinkHit[] {
  const siteRoot = normalizeWebsiteUrl(baseUrl);
  const $ = cheerio.load(html);
  const byUrl = new Map<string, { weight: number; anchors: Set<string> }>();

  const bump = (href: string, weight: number, anchor: string) => {
    const norm = normalizeInternal(href, siteRoot);
    if (!norm) return;
    const existing = byUrl.get(norm) ?? { weight: 0, anchors: new Set<string>() };
    existing.weight += weight;
    if (anchor.length > 1 && anchor.length < 80) existing.anchors.add(anchor.toLowerCase());
    byUrl.set(norm, existing);
  };

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
      return;
    const text = $(el).text().trim();
    let weight = regionWeight($, el);
    if (text.length > 2 && text.length < 80) weight += 1;
    bump(href, weight, text);
  });

  const rootNorm = normalizeInternal(siteRoot, siteRoot);
  if (rootNorm) byUrl.delete(rootNorm);

  return [...byUrl.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, limit)
    .map(([url, data]) => ({
      url,
      weight: data.weight,
      anchorText: [...data.anchors].join(' '),
    }));
}
