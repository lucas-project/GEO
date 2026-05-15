import type { CheerioAPI } from 'cheerio';
import type { Heading } from '../schemas';

export function extractHeadings($: CheerioAPI): Heading[] {
  const out: Heading[] = [];
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) out.push({ level, text });
    });
  }
  return out;
}
