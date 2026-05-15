import type { CheerioAPI } from 'cheerio';
import { sameTargetSite } from '@/lib/website-url';
import type { LinkInfo } from '../schemas';

export function extractLinks($: CheerioAPI, pageUrl: string): LinkInfo[] {
  const out: LinkInfo[] = [];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') ?? '').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) {
      return;
    }
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    const text = $el.text().replace(/\s+/g, ' ').trim().slice(0, 240);
    const isInternal = sameTargetSite(abs, pageUrl);
    out.push({
      href: abs,
      text: text || abs,
      isInternal,
      rel: $el.attr('rel') ?? null,
    });
  });

  return out.slice(0, 400);
}
