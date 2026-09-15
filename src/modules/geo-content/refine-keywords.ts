/**
 * Use a lightweight model to merge keyword candidates while preserving meaningful phrases.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { resolveGeoContentModel } from './model';
import {
  isValidKeywordTerm,
  pruneSubsumedKeywords,
  trimToKeyword,
  type GeoContentKeyword,
} from './keywords';

const RefineKeywordsSchema = z.object({
  keywords: z.array(z.string()).min(3).max(12),
});

const REFINE_SYSTEM = `You refine SEO/GEO keyword candidates extracted from a website page.

Rules:
- Return 5–12 keywords, each 2–5 words only.
- KEEP meaningful multi-word phrases intact (e.g. "data types", "customer support").
- DROP meaningless fragments split from a phrase (e.g. if "data types" exists, do NOT also return "data" and "types" alone).
- DROP brand names, page titles, taglines, and generic words (home, page, contact).
- Prefer industry/product terms a customer would search for.
- Only return terms that fit the site's topic.`;

export async function refineKeywordsWithModel(input: {
  candidates: GeoContentKeyword[];
  title: string;
  description: string;
  headings: string[];
}): Promise<GeoContentKeyword[]> {
  const pruned = pruneSubsumedKeywords(input.candidates);
  if (pruned.length <= 3) return pruned;

  const prompt = `Page title (context): ${input.title || '(none)'}
Meta description: ${input.description || '(none)'}
Headings: ${input.headings.slice(0, 10).join(' | ') || '(none)'}

Candidate keywords from the page (may include bad splits — fix these):
${pruned.map((k) => `- ${k.term}`).join('\n')}

Return JSON: { "keywords": ["...", ...] }`;

  try {
    const contentModel = resolveGeoContentModel(ai.name);
    const { data } = await ai.generateStructuredOutput({
      schema: RefineKeywordsSchema,
      schemaName: 'RefineKeywords',
      system: REFINE_SYSTEM,
      prompt,
      temperature: 0.2,
      ...(contentModel ? { model: contentModel } : {}),
    });

    const parsed = RefineKeywordsSchema.parse(data);
    const byTerm = new Map(pruned.map((k) => [k.term.toLowerCase(), k]));
    const out: GeoContentKeyword[] = [];

    for (const raw of parsed.keywords) {
      const term = trimToKeyword(raw);
      if (!term || !isValidKeywordTerm(term)) continue;
      const key = term.toLowerCase();
      if (out.some((k) => k.term.toLowerCase() === key)) continue;
      const prev = byTerm.get(key);
      out.push({
        term,
        relevance: Math.max(0.5, 1 - out.length * 0.06),
        confidence: prev?.confidence ?? Math.max(0.55, 0.85 - out.length * 0.04),
        source: prev?.source ?? 'body',
        evidence: prev?.evidence ?? term,
      });
    }

    const refined = pruneSubsumedKeywords(out);
    return refined.length >= 3 ? refined.slice(0, 12) : pruned.slice(0, 12);
  } catch {
    return pruned.slice(0, 12);
  }
}
