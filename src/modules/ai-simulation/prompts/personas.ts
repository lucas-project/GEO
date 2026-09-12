/**
 * AI Simulation prompts.
 *
 * Personas modeled per blueprint Section 4.4 (AI Simulation Engine).
 * The shared `runOnAllPlatforms()` in shared/ai/multi.ts uses these directly;
 * we ALSO expose them here for documentation + per-module overrides.
 */

import type { Platform } from '../schemas';

export const SIMULATION_PROMPT_GUIDE = `When responding to AI search queries:
- Provide a useful direct answer first.
- List any brands, products, or organizations you would cite as sources.
- Include URLs in the form (https://example.com/...) where you have strong recall.
- Be concise — typical AI search responses are 60-180 words.`;

export const CITATION_EXTRACTION_SYSTEM = `You are a citation extraction system.
Given an AI search response, identify every company, manufacturer, retailer, or organization mentioned or cited as a source.

For each entity, record:
- brand: canonical company/brand name only (null if unknown). Use "Midea" not "Midea Ducted System". Do NOT use generic words (energy, quality, system) or product model lines as brands.
- url: full URL if present (null otherwise)
- domain: bare domain like "example.com" (null otherwise)
- position: 1-indexed appearance order in the response
- snippet: a 30-80 char context window around the mention

Return JSON: { "citations": [...] }.
Skip generic terms ("the company", "the website", product descriptors without a brand).`;

export const PROMPT_VARIANTS_SYSTEM = `You generate prompt variants for AI search visibility testing.

Given a base prompt, produce N paraphrased variants that real users would type into ChatGPT, Gemini, Claude, or Perplexity.
Variants should:
- Preserve the intent
- Vary phrasing, formality, and specificity
- Cover different user personas (beginner / expert / commercial / informational)

Return JSON: { "variants": ["...", "..."] }.`;

export function buildCitationExtractionPrompt(responseText: string): string {
  return `Extract all citations / brand mentions from this AI search response.

"""
${responseText.slice(0, 4000)}
"""

Return JSON: { "citations": [...] }.`;
}

export function buildPromptVariantsPrompt(input: { base: string; count: number }): string {
  return `Base prompt: "${input.base}"

Generate ${input.count} paraphrased variants.

Return JSON: { "variants": [...] }.`;
}

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};
