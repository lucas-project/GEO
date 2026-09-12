import * as cheerio from 'cheerio';
import type { EntityPageInput } from './resolve-entity';

export function pageContextFromPages(pages: EntityPageInput[]): {
  title: string;
  description: string;
  headings: string[];
} {
  let title = '';
  let description = '';
  const headings: string[] = [];
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    if (!title) title = $('title').first().text().trim();
    if (!description) {
      description =
        $('meta[name="description"]').attr('content')?.trim() ??
        $('meta[property="og:description"]').attr('content')?.trim() ??
        '';
    }
    $('h1, h2, h3').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length >= 3 && t.length <= 120) headings.push(t);
    });
  }
  return { title, description, headings: headings.slice(0, 20) };
}

/** Rich page text for LLM steps (search plan, brand resolution, keywords). */
export function extractRichPageContext(pages?: EntityPageInput[]): string {
  if (!pages?.length) return '';

  const blocks: string[] = [];
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const title = $('title').first().text().replace(/\s+/g, ' ').trim();
    const description =
      $('meta[name="description"]').attr('content')?.trim() ??
      $('meta[property="og:description"]').attr('content')?.trim() ??
      '';
    const ogSite = $('meta[property="og:site_name"]').attr('content')?.trim() ?? '';
    const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const headings: string[] = [];
    $('h2, h3').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length >= 3 && t.length <= 120) headings.push(t);
    });
    const schemaNames = (page.schemas ?? [])
      .flatMap((s) => {
        const raw = s.raw as Record<string, unknown>;
        const names: string[] = [];
        if (typeof raw.name === 'string') names.push(raw.name);
        return names;
      })
      .filter(Boolean);
    const bodySnippet = $('main p, article p, body p')
      .slice(0, 4)
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((t) => t.length >= 30 && t.length <= 280)
      .join(' ');

    const parts = [
      title ? `Title: ${title}` : null,
      ogSite ? `Site name: ${ogSite}` : null,
      h1 ? `H1: ${h1}` : null,
      description ? `Description: ${description.slice(0, 400)}` : null,
      headings.length ? `Headings: ${headings.slice(0, 8).join(' | ')}` : null,
      schemaNames.length ? `Schema names: ${schemaNames.slice(0, 4).join(', ')}` : null,
      bodySnippet ? `Body: ${bodySnippet.slice(0, 500)}` : null,
    ].filter(Boolean);
    if (parts.length) blocks.push(parts.join('\n'));
  }

  return blocks.join('\n\n').slice(0, 3500);
}

/** Back-compat thin hints for heuristics. */
export function extractPageHints(pages?: EntityPageInput[]): string {
  return extractRichPageContext(pages).slice(0, 2000);
}
