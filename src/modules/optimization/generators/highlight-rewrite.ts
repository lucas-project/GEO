/**
 * Unified highlight rewrite entry (mock + LLM).
 */

import type { Dimension } from '@modules/geo-audit/schemas';
import { ai } from '@shared/ai';
import { z } from 'zod';
import {
  ANSWER_FIRST_SYSTEM,
  READABILITY_SHORTEN_SYSTEM,
  buildAnswerFirstPrompt,
  buildReadabilityShortenPrompt,
} from '../prompts';
import { rewriteAnswerFirstLocal } from './answer-first-local';
import { rewriteReadabilityLocal, wantsShorterSentence } from './readability-rewrite';

const ResponseSchema = z.object({
  rewritten: z.string(),
  rationale: z.string(),
});

export function prefersShorterRewrite(input: {
  dimension?: Dimension;
  fixHint?: string;
  problem?: string;
}): boolean {
  return input.dimension === 'aiReadability' || wantsShorterSentence(input.fixHint, input.problem);
}

export async function generateHighlightRewrite(input: {
  title: string;
  firstChunk: string;
  heading?: string;
  highlightLabel?: string;
  variantIndex?: number;
  dimension?: Dimension;
  problem?: string;
  fixHint?: string;
}): Promise<{ rewritten: string; rationale: string }> {
  const shorter = prefersShorterRewrite(input);
  const variantIndex = input.variantIndex ?? 0;

  if (ai.name === 'mock') {
    return shorter
      ? rewriteReadabilityLocal({
          firstChunk: input.firstChunk,
          variantIndex,
        })
      : rewriteAnswerFirstLocal({
          ...input,
          variantIndex,
        });
  }

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: ResponseSchema,
      schemaName: shorter ? 'ReadabilityShorten' : 'AnswerFirst',
      system: shorter ? READABILITY_SHORTEN_SYSTEM : ANSWER_FIRST_SYSTEM,
      prompt: shorter
        ? buildReadabilityShortenPrompt({ ...input, variantIndex })
        : buildAnswerFirstPrompt({ ...input, variantIndex }),
    });
    return data;
  } catch {
    return shorter
      ? rewriteReadabilityLocal({ firstChunk: input.firstChunk, variantIndex })
      : rewriteAnswerFirstLocal({ ...input, variantIndex });
  }
}
