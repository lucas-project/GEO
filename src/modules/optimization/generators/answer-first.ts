/**
 * Answer-first rewrite generator.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { ANSWER_FIRST_SYSTEM, buildAnswerFirstPrompt } from '../prompts';

const ResponseSchema = z.object({
  rewritten: z.string(),
  rationale: z.string(),
});

export async function generateAnswerFirst(input: {
  title: string;
  firstChunk: string;
}): Promise<{ rewritten: string; rationale: string }> {
  try {
    const { data } = await ai.generateStructuredOutput({
      schema: ResponseSchema,
      schemaName: 'AnswerFirst',
      system: ANSWER_FIRST_SYSTEM,
      prompt: buildAnswerFirstPrompt(input),
    });
    return data;
  } catch {
    const lead = input.firstChunk.split(/[.!?]/)[0]?.trim() || input.title;
    return {
      rewritten: `${lead}. ${input.firstChunk.slice(lead.length + 1, 400).trim()}`.trim(),
      rationale: 'Fallback rewrite from the existing lead (AI generation unavailable).',
    };
  }
}
