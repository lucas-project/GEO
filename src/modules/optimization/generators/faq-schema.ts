/**
 * FAQ JSON-LD generator.
 *
 * Combines the page's extracted FAQs with LLM-generated additions, then
 * produces a schema.org FAQPage JSON-LD block ready to drop into <head>.
 */

import type { FaqEntry } from '@modules/extraction';

export async function generateFaqSchema(input: {
  title: string;
  url: string;
  bodyText: string;
  existingFaqs: FaqEntry[];
  siteId?: string | null;
}): Promise<{ jsonLd: string; entries: Array<{ question: string; answer: string }>; rationale: string }> {
  // Markup must only contain answers that are already visible on the page.
  const additional: Array<{ question: string; answer: string }> = [];

  const entries = [
    ...input.existingFaqs.map((f) => ({ question: f.question, answer: f.answer })),
    ...additional,
  ].slice(0, 12);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': entries.map((e) => ({
      '@type': 'Question',
      'name': e.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': e.answer,
      },
    })),
  };

  return {
    jsonLd: entries.length ? JSON.stringify(schema, null, 2) : '',
    entries,
    rationale:
      entries.length ? `Draft markup for ${entries.length} visible question and answer pairs. Review before applying.`
        : 'Insufficient evidence: no visible FAQ answers were extracted. Add factual answers to the page first.',
  };
}
