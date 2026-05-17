/**
 * Lightweight extraction for GEO discovery probing (no LLM / entities).
 */

import * as cheerio from 'cheerio';
import { extractSchemas } from './extractors/schema';
import { extractFaqs } from './extractors/faq';

export interface DiscoveryProbeSignals {
  schemaTypes: string[];
  faqCount: number;
  questionHeadings: number;
}

export function extractDiscoveryProbeSignals(html: string): DiscoveryProbeSignals {
  const $ = cheerio.load(html);
  const schemas = extractSchemas($);
  const faqs = extractFaqs($, schemas);
  const schemaTypes = [...new Set(schemas.map((s) => s.type))];

  let questionHeadings = 0;
  $('h2, h3').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.endsWith('?') && text.length >= 8 && text.length <= 200) questionHeadings++;
  });

  return { schemaTypes, faqCount: faqs.length, questionHeadings };
}
