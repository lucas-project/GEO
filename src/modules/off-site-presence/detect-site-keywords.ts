import * as cheerio from 'cheerio';
import { extractRelevantKeywords } from '@modules/geo-content';
import type { EntityPageInput } from './resolve-entity';

const MIN_KEYWORDS = 5;
const MAX_KEYWORDS = 10;
const MIN_CONFIDENCE = 0.5;

function parsePageSignals(html: string): {
  title: string;
  description: string;
  headings: string[];
} {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  const description =
    $('meta[name="description"]').attr('content')?.trim() ??
    $('meta[property="og:description"]').attr('content')?.trim() ??
    '';
  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && t.length <= 120) headings.push(t);
  });
  const bodySnippet = $('main p, article p, body p')
    .slice(0, 6)
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length >= 20);

  return {
    title,
    description,
    headings: [...headings, ...bodySnippet.slice(0, 4)],
  };
}

/**
 * Extract short on-page keywords from crawled HTML (homepage / about).
 * Low-confidence / insufficient-evidence pages return [].
 */
export function detectSiteKeywordsFromPages(pages: EntityPageInput[]): string[] {
  if (!pages.length) return [];

  let title = '';
  let description = '';
  const headings: string[] = [];
  const chunkTexts: string[] = [];

  for (const page of pages) {
    const signals = parsePageSignals(page.html);
    if (!title && signals.title) title = signals.title;
    if (!description && signals.description) description = signals.description;
    headings.push(...signals.headings);
    const plain = cheerio.load(page.html).root().text().replace(/\s+/g, ' ').trim();
    if (plain.length > 80) chunkTexts.push(plain.slice(0, 800));
  }

  const extraction = extractRelevantKeywords({
    title,
    description,
    headings: headings.slice(0, 20),
    faqQuestions: [],
    chunkTexts: chunkTexts.slice(0, 6),
    tableTexts: [],
    limit: MAX_KEYWORDS,
    minConfidence: MIN_CONFIDENCE,
  });

  if (extraction.status === 'insufficient_topic_evidence') return [];

  const terms = [
    ...new Set(
      extraction.keywords
        .filter((k) => (k.confidence ?? 0) >= MIN_CONFIDENCE)
        .map((k) => k.term),
    ),
  ];
  return terms.slice(0, MAX_KEYWORDS);
}

export function meetsKeywordMinimum(keywords: string[]): boolean {
  return keywords.length >= MIN_KEYWORDS;
}

export const SITE_KEYWORD_LIMITS = { min: MIN_KEYWORDS, max: MAX_KEYWORDS };
