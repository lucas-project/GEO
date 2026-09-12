import type { CheerioAPI } from 'cheerio';
import type { LinkInfo } from '@modules/extraction';

/** Add rel=me and og:see_also URLs not already in link list. */
export function augmentLinksWithMarkup(
  links: LinkInfo[],
  $: CheerioAPI,
  pageUrl: string,
): LinkInfo[] {
  const seen = new Set(links.map((l) => l.href));
  const extra: LinkInfo[] = [];

  const push = (href: string, text: string) => {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:')) return;
    try {
      const abs = new URL(trimmed, pageUrl).toString();
      if (seen.has(abs)) return;
      seen.add(abs);
      extra.push({
        href: abs,
        text: text.slice(0, 240) || abs,
        isInternal: false,
        rel: 'me',
      });
    } catch {
      /* ignore */
    }
  };

  $('a[rel~="me"][href]').each((_, el) => {
    push($(el).attr('href') ?? '', $(el).text());
  });

  $('meta[property="og:see_also"][content]').each((_, el) => {
    push($(el).attr('content') ?? '', 'og:see_also');
  });

  return extra.length > 0 ? [...links, ...extra] : links;
}
