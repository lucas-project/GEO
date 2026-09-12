import type { CheerioAPI } from 'cheerio';
import type { PageMetadata } from '../schemas';

function attr($: CheerioAPI, selector: string, attribute: string): string | null {
  const value = $(selector).attr(attribute);
  return value ? value.trim() : null;
}

function metaContent($: CheerioAPI, name: string, attrName = 'name'): string | null {
  const v = $(`meta[${attrName}="${name}"]`).attr('content');
  return v ? v.trim() : null;
}

export function extractMetadata($: CheerioAPI): PageMetadata {
  return {
    title: $('title').first().text().trim() || null,
    description: metaContent($, 'description'),
    canonical: attr($, 'link[rel="canonical"]', 'href'),
    ogTitle: metaContent($, 'og:title', 'property'),
    ogSiteName: metaContent($, 'og:site_name', 'property'),
    ogDescription: metaContent($, 'og:description', 'property'),
    ogType: metaContent($, 'og:type', 'property'),
    twitterCard: metaContent($, 'twitter:card'),
    language: attr($, 'html', 'lang'),
    charset: $('meta[charset]').attr('charset') ?? null,
    robots: metaContent($, 'robots'),
  };
}
