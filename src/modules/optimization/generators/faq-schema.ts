/**
 * FAQ JSON-LD generator.
 *
 * Combines the page's extracted FAQs with LLM-generated additions, then
 * produces a schema.org FAQPage JSON-LD block ready to drop into <head>.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { FaqEntry } from '@modules/extraction';
import { getIntelligenceContext } from '@modules/intelligence';
import { FAQ_GENERATION_SYSTEM, buildFaqGenerationPrompt } from '../prompts';

const optLogger = logger.child({ module: 'optimization' });

const FaqResponseSchema = z.object({
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
});

export async function generateFaqSchema(input: {
  title: string;
  url: string;
  bodyText: string;
  existingFaqs: FaqEntry[];
  siteId?: string | null;
}): Promise<{ jsonLd: string; entries: Array<{ question: string; answer: string }>; rationale: string }> {
  const additional = await generateAdditionalFaqs(input);

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
    jsonLd: JSON.stringify(schema, null, 2),
    entries,
    rationale:
      `Generated FAQPage JSON-LD with ${entries.length} Q&A pairs. ` +
      `${input.existingFaqs.length} were extracted from the page; ${additional.length} were generated to fill obvious gaps. ` +
      `LLMs heavily favor FAQPage-marked-up content when answering questions.`,
  };
}

async function generateAdditionalFaqs(input: {
  title: string;
  bodyText: string;
  siteId?: string | null;
}): Promise<Array<{ question: string; answer: string }>> {
  try {
    const cohortHint = input.siteId ? await getIntelligenceContext(input.siteId) : '';
    const prompt = buildFaqGenerationPrompt(input);
    const enriched = cohortHint
      ? `${prompt}\n\nHigh-performing patterns from similar sites:\n${cohortHint}`
      : prompt;
    const { data } = await ai.generateStructuredOutput({
      schema: FaqResponseSchema,
      schemaName: 'FaqGeneration',
      system: FAQ_GENERATION_SYSTEM,
      prompt: enriched,
    });
    return data.faqs.slice(0, 8);
  } catch (err) {
    optLogger.warn({ err: (err as Error).message }, 'FAQ generation fell back to empty');
    return [];
  }
}
