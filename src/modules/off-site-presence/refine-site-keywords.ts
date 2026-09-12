import { z } from 'zod';
import {
  getSiteKeywordsAI,
  resolvedSiteKeywordsProviderName,
} from '@shared/ai';
import { config } from '@shared/config';
import { logger } from '@shared/logger';
import { resolveSiteKeywordsModel } from './model';

const RefineSiteKeywordsSchema = z.object({
  keywords: z.array(z.string()).min(3).max(10),
});

const REFINE_SYSTEM = `You refine website keywords for off-site brand presence search.

Rules:
- Return 5–10 short keywords (1–4 words each).
- KEEP product/service phrases customers search (e.g. "split system", "air conditioning", "HVAC dealer").
- DROP: error code lists, support doc fragments, nav words (home, contact, about), bare numbers, page titles, brand-only tokens.
- DROP meaningless fragments; keep multi-word phrases intact.
- Prefer industry terms relevant to how people discuss the brand online.`;

export function shouldRefineSiteKeywords(): boolean {
  const provider = resolvedSiteKeywordsProviderName();
  if (provider === 'mock') return false;
  if (provider === 'minimax' && !config.minimax.apiKey) return false;
  return true;
}

export async function refineSiteKeywordsWithModel(input: {
  candidates: string[];
  title: string;
  description: string;
  headings: string[];
}): Promise<string[]> {
  const candidates = [...new Set(input.candidates.map((k) => k.trim()).filter(Boolean))];
  if (candidates.length <= 3 || !shouldRefineSiteKeywords()) {
    return candidates.slice(0, 10);
  }

  const prompt = `Page title: ${input.title || '(none)'}
Meta description: ${input.description || '(none)'}
Headings: ${input.headings.slice(0, 10).join(' | ') || '(none)'}

Candidate keywords (fix bad extractions):
${candidates.map((k) => `- ${k}`).join('\n')}

Return JSON: { "keywords": ["...", ...] }`;

  try {
    const siteKeywordsAI = getSiteKeywordsAI();
    const providerName = resolvedSiteKeywordsProviderName();
    const model = resolveSiteKeywordsModel(providerName);
    const { data } = await siteKeywordsAI.generateStructuredOutput({
      schema: RefineSiteKeywordsSchema,
      schemaName: 'RefineSiteKeywords',
      system: REFINE_SYSTEM,
      prompt,
      temperature: 0.2,
      ...(model ? { model } : {}),
    });

    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of data.keywords) {
      const term = raw.trim().replace(/\s+/g, ' ');
      if (!term || term.length < 3 || term.length > 48) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(term);
    }

    return out.length >= 3 ? out.slice(0, 10) : candidates.slice(0, 10);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'site keyword refine failed — using heuristics');
    return candidates.slice(0, 10);
  }
}
