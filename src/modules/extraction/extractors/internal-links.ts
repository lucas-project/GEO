import type { CheerioAPI } from 'cheerio';
import { sameTargetSite } from '@/lib/website-url';

export type LinkPathKind =
  | 'pricing'
  | 'about'
  | 'contact'
  | 'compare'
  | 'signup'
  | 'blog'
  | 'other';

export interface EnrichedInternalLink {
  href: string;
  text: string;
  pathKind: LinkPathKind;
}

export interface InternalLinkSignals {
  internalCount: number;
  uniquePathKinds: LinkPathKind[];
  hasPricingLink: boolean;
  hasSignupLink: boolean;
  anchorDiversity: number;
}

function classifyPath(pathname: string): LinkPathKind {
  if (/\/pricing|\/plans(\/|$)/i.test(pathname)) return 'pricing';
  if (/\/compare|\/vs(\/|$)/i.test(pathname)) return 'compare';
  if (/\/contact|\/about(\/|$)/i.test(pathname)) return 'contact';
  if (/\/blog(\/|$)/i.test(pathname)) return 'blog';
  if (/\/signup|\/register|\/demo|\/trial(\/|$)/i.test(pathname)) return 'signup';
  return 'other';
}

export function extractEnrichedInternalLinks(
  $: CheerioAPI,
  pageUrl: string,
): EnrichedInternalLink[] {
  const out: EnrichedInternalLink[] = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (!sameTargetSite(abs, pageUrl)) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200);
    const pathKind = classifyPath(new URL(abs).pathname);
    out.push({ href: abs, text: text || abs, pathKind });
  });
  return out.slice(0, 200);
}

export function summarizeInternalLinks(links: EnrichedInternalLink[]): InternalLinkSignals {
  const kinds = new Set(links.map((l) => l.pathKind));
  const anchors = new Set(links.map((l) => l.text.toLowerCase().slice(0, 40)));
  return {
    internalCount: links.length,
    uniquePathKinds: [...kinds],
    hasPricingLink: kinds.has('pricing'),
    hasSignupLink: kinds.has('signup'),
    anchorDiversity: anchors.size,
  };
}
