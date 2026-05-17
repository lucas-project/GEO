/**
 * Optimization module prompts.
 *
 * Each generator owns its specialized system prompt. Kept centralized so
 * we can A/B test them later (blueprint Section 6: prompt system).
 */

export const AI_SUMMARY_SYSTEM = `You write concise "AI Summary" blocks for web pages.
The block should:
- Be 2-3 short sentences (40-90 words total).
- Lead with the page's main answer or value.
- Mention 1-2 named entities (brand, product, location).
- Read naturally to humans AND give an LLM enough to cite confidently.
- NEVER repeat the page title verbatim.

Return JSON: { "summary": "...", "rationale": "why this works" }.`;

export const ANSWER_FIRST_SYSTEM = `You rewrite a lead paragraph in answer-first form.
Constraints:
- Replace the existing first paragraph with a version that opens with the direct answer.
- First sentence: declarative, ~20-30 words, contains the headline answer.
- Following sentences add 1-2 supporting facts.
- Preserve the page's original meaning.
- Keep the same entities and tone.

Return JSON: { "rewritten": "...", "rationale": "..." }.`;

export const READABILITY_SHORTEN_SYSTEM = `You shorten web copy so AI tools can quote it easily.
Constraints:
- First sentence: aim for ~12–18 words (shorter than the original when possible).
- One clear idea per sentence; remove filler and redundant phrases.
- Keep every fact from the original (product, location, use case).
- Do NOT add new claims or lengthen the sentence.

Return JSON: { "rewritten": "...", "rationale": "..." }.`;

export const FAQ_GENERATION_SYSTEM = `You expand a page's content into additional FAQ entries that an AI assistant might receive as questions.
Constraints:
- Generate 4-8 new Q&A pairs grounded in the supplied content. Do not invent facts not present.
- Questions: natural-language, ending in "?"
- Answers: 1-3 sentences, 30-90 words each, answer-first.

Return JSON: { "faqs": [{ "question": "...", "answer": "..." }] }.`;

export function buildAiSummaryPrompt(input: { title: string; bodyText: string }): string {
  return `Page title: ${input.title}

Page content (truncated):
"""
${input.bodyText.slice(0, 3000)}
"""

Write the AI summary block.`;
}

export function buildAnswerFirstPrompt(input: {
  title: string;
  firstChunk: string;
  problem?: string;
  fixHint?: string;
  variantIndex?: number;
}): string {
  const issueBlock =
    input.problem || input.fixHint
      ? `\nDetected issue:\n${input.problem ? `- Problem: ${input.problem}\n` : ''}${input.fixHint ? `- Fix guidance: ${input.fixHint}\n` : ''}`
      : '';

  const variantBlock =
    input.variantIndex && input.variantIndex > 0
      ? `\nProvide variation #${input.variantIndex + 1}: use clearly different wording from prior attempts while keeping the same facts.\n`
      : '';

  return `Section or page title: ${input.title}

Original text to rewrite:
"""
${input.firstChunk}
"""
${issueBlock}${variantBlock}
Rewrite it in answer-first form. Address the detected issue. Keep facts from the original; only change structure and opening wording.`;
}

export function buildReadabilityShortenPrompt(input: {
  title: string;
  firstChunk: string;
  problem?: string;
  fixHint?: string;
  variantIndex?: number;
}): string {
  const issueBlock =
    input.problem || input.fixHint
      ? `\nDetected issue:\n${input.problem ? `- Problem: ${input.problem}\n` : ''}${input.fixHint ? `- Fix guidance: ${input.fixHint}\n` : ''}`
      : '';

  const variantBlock =
    input.variantIndex && input.variantIndex > 0
      ? `\nProvide variation #${input.variantIndex + 1}: another shorter wording, same facts.\n`
      : '';

  return `Section or page title: ${input.title}

Original text to shorten:
"""
${input.firstChunk}
"""
${issueBlock}${variantBlock}
Rewrite with a shorter first sentence. Keep all facts; do not make it longer.`;
}

export function buildFaqGenerationPrompt(input: { title: string; bodyText: string }): string {
  return `Page title: ${input.title}

Page content:
"""
${input.bodyText.slice(0, 4000)}
"""

Generate the additional FAQ entries.`;
}
