/**
 * GEO Audit narrative prompts.
 *
 * The narrative is the human-readable executive summary the user sees on
 * top of the report. We constrain it to be precise, action-oriented, and
 * grounded in the dimension reasons (so it can't hallucinate scores).
 */

import type { DimensionScore } from '../schemas';

export const NARRATIVE_SYSTEM = `You are a GEO (Generative Engine Optimization) consultant.
Your job: explain why a website is or isn't easy for AI search engines (ChatGPT, Gemini, Claude, Perplexity) to understand and cite, based on the dimension scores and reasons provided.

Rules:
- Be concrete and specific. Reference the actual reasons supplied.
- 3-4 short paragraphs maximum.
- Lead with the most impactful insight first.
- Do NOT invent numbers or facts not in the inputs.
- Tone: confident, technical, pragmatic. No fluff. No emojis.`;

export function buildNarrativePrompt(input: {
  url: string;
  overallScore: number;
  dimensions: Record<string, DimensionScore>;
}): string {
  const dimensionLines = Object.entries(input.dimensions)
    .map(([name, d]) => `- ${name} (${d.score}/100): ${d.reasons.join(' · ')}`)
    .join('\n');
  return `URL: ${input.url}
Overall GEO score: ${input.overallScore}/100

Per-dimension breakdown:
${dimensionLines}

Write a concise executive summary explaining where this page stands today for AI search visibility, what the biggest blocker is, and what fixing it would unlock.

Return JSON: { "narrative": "..." } — plain text, no markdown.`;
}
