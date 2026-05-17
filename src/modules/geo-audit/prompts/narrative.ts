/**
 * GEO Audit narrative prompts.
 *
 * The narrative is the human-readable executive summary the user sees on
 * top of the report. We constrain it to be precise, action-oriented, and
 * grounded in the dimension reasons (so it can't hallucinate scores).
 */

import { getIntelligenceContext } from '@modules/intelligence';
import { LAYER_LABELS, DIMENSION_LABELS, type DimensionScore, type ScoringMeta } from '../schemas';

export const NARRATIVE_SYSTEM = `You are a GEO (Generative Engine Optimization) consultant.
Your job: explain why a website is or isn't easy for AI search engines (ChatGPT, Gemini, Claude, Perplexity) to understand and cite, based on the dimension scores and reasons provided.

Rules:
- Be concrete and specific. Reference the actual reasons supplied.
- 3-4 short paragraphs maximum.
- Lead with the most impactful insight first.
- Do NOT invent numbers or facts not in the inputs.
- Tone: confident, technical, pragmatic. No fluff. No emojis.`;

export async function buildNarrativePrompt(input: {
  url: string;
  overallScore: number;
  dimensions: Record<string, DimensionScore>;
  scoringMeta?: ScoringMeta;
  siteId?: string;
}): Promise<string> {
  const dimensionLines = Object.entries(input.dimensions)
    .map(([name, d]) => `- ${name} (${d.score}/100): ${d.reasons.join(' · ')}`)
    .join('\n');

  const pipelineBlock = input.scoringMeta
    ? `
AI visibility pipeline (causal order):
${Object.entries(input.scoringMeta.layers)
  .map(
    ([layer, ls]) =>
      `- ${LAYER_LABELS[layer as keyof typeof LAYER_LABELS]}: ${ls.effectiveScore}/100 (raw ${ls.rawScore})`,
  )
  .join('\n')}
Citation probability: ${Math.round(input.scoringMeta.citationProbability * 100)}%
Primary bottleneck: ${LAYER_LABELS[input.scoringMeta.bottleneck.layer]} — ${DIMENSION_LABELS[input.scoringMeta.bottleneck.dimension]} (${input.scoringMeta.bottleneck.reason})
`
    : '';

  const cohortContext = input.siteId
    ? await getIntelligenceContext(input.siteId)
    : '';

  const benchmarkBlock = cohortContext
    ? `\nCohort intelligence (from prior audits — cite when relevant):\n${cohortContext}\n`
    : '';

  return `URL: ${input.url}
Overall GEO score: ${input.overallScore}/100
${pipelineBlock}
Per-dimension breakdown:
${dimensionLines}
${benchmarkBlock}
Write a concise executive summary explaining where this site stands in the AI visibility pipeline (crawl → understand → generate → cite). Lead with the pipeline bottleneck, not a random weak dimension. Explain what fixing the bottleneck would unlock for AI citation.

Return JSON: { "narrative": "..." } — plain text, no markdown.`;
}
