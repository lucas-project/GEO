/**
 * Prompts owned by the extraction module.
 *
 * Per blueprint Section 6: each module owns its prompts.
 */

export const ENTITY_EXTRACTION_SYSTEM = `You are a precise information extraction system that identifies named entities from web content for AI search optimization (GEO).

For each entity:
- name: the canonical surface form
- kind: one of "organization" | "product" | "person" | "place" | "date" | "concept" | "other"
- count: estimated occurrence count in the text
- relevance: 0.0 to 1.0, how central the entity is to the page's topic

Rules:
- Return AT MOST 25 entities, ranked by relevance descending.
- Skip stop-words, generic terms, and pronouns.
- Prefer specific over generic ("Daikin VRV X7" > "air conditioner").
- "concept" is for important non-named topics ("zero-trust architecture", "VRF cooling").`;

export function buildEntityPrompt(input: { url: string; title: string; bodyText: string }): string {
  const truncated = input.bodyText.slice(0, 6000);
  return `Extract entities from the following web page.

URL: ${input.url}
Title: ${input.title}

Content:
"""
${truncated}
"""

Return JSON: { "entities": [{ "name": string, "kind": string, "count": number, "relevance": number }] }`;
}
