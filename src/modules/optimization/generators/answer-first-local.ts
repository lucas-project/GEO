/**
 * Rule-based answer-first rewrite for mock/offline mode and AI fallbacks.
 * Preserves facts from the highlighted text instead of generic placeholder copy.
 */

import { buildAnswerFirstRewrite } from './answer-first-rewrite';
import { resolveRewriteHeading } from './rewrite-heading';

export function rewriteAnswerFirstLocal(input: {
  title: string;
  firstChunk: string;
  heading?: string;
  highlightLabel?: string;
  variantIndex?: number;
}): { rewritten: string; rationale: string } {
  const text = input.firstChunk.trim();
  const heading = resolveRewriteHeading({
    heading: input.heading,
    highlightLabel: input.highlightLabel,
    fallbackTitle: input.title,
  });
  const rewritten = buildAnswerFirstRewrite({
    heading: heading ?? null,
    highlightLabel: input.highlightLabel,
    text: text || input.title,
    variantIndex: input.variantIndex,
  }).trim();

  return {
    rewritten: rewritten || text,
    rationale:
      'Rule-based rewrite from your highlighted text (mock/offline mode). For AI rewrites, set AI_PROVIDER=openai (or anthropic/gemini) and the matching API key in .env.',
  };
}
