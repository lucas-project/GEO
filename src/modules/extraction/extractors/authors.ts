import type { CheerioAPI } from 'cheerio';
import type { AuthorSignal, SchemaBlock } from '../schemas';

const AUTHOR_TYPES = new Set(['Article', 'NewsArticle', 'BlogPosting', 'Person']);

export function extractAuthors($: CheerioAPI, schemas: SchemaBlock[]): AuthorSignal[] {
  const out: AuthorSignal[] = [];

  const metaAuthor = $('meta[name="author"]').attr('content')?.trim();
  if (metaAuthor) out.push({ source: 'meta', name: metaAuthor });

  $('a[rel="author"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) out.push({ source: 'rel-author', name });
  });

  $('.byline, [itemprop="author"]').each((_, el) => {
    const name = $(el).text().replace(/\s+/g, ' ').trim();
    if (name && name.length < 120) {
      const bio = $(el).closest('article, .post, main').find('.author-bio, [class*="author"]').first();
      const bioSnippet = bio.text().replace(/\s+/g, ' ').trim().slice(0, 200);
      out.push({
        source: 'byline',
        name,
        bioSnippet: bioSnippet.length > name.length + 10 ? bioSnippet : undefined,
      });
    }
  });

  for (const block of schemas) {
    if (!AUTHOR_TYPES.has(block.type)) continue;
    const obj = block.raw as Record<string, unknown> | null;
    if (!obj) continue;
    const author = obj.author;
    const list = Array.isArray(author) ? author : author ? [author] : [];
    for (const a of list) {
      if (typeof a === 'string') out.push({ source: 'schema', name: a });
      else if (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string') {
        out.push({ source: 'schema', name: (a as { name: string }).name });
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
