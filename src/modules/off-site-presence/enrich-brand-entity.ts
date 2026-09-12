import { z } from 'zod';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import { logger } from '@shared/logger';
import type { BrandEntityResult } from './schemas';
import { buildBrandAliases } from './aliases';
import { resolvePresenceModel } from './model';

const BrandEnrichmentSchema = z.object({
  primaryBrand: z.string().min(2).max(80),
  aliases: z.array(z.string()).max(6),
  businessSummary: z.string().max(200),
  searchTerms: z.array(z.string()).min(3).max(10),
});

const BRAND_ENRICH_SYSTEM = `You read a business website and infer how people search for this company OFF-SITE (Reddit, news, reviews).

Rules:
- primaryBrand: the LOCAL dealer/installer trading name (e.g. "MD Home", "mdhome") — NOT the manufacturer alone.
- For authorized dealers: put the MANUFACTURER (e.g. Midea, Daikin) in aliases, NOT as primaryBrand unless the site IS the manufacturer.
- aliases: dealer abbreviations, manufacturer names, "Midea dealer", city/region if visible.
- businessSummary: one sentence — dealer/installer role, products, region.
- searchTerms: 5–10 phrases for off-site search — mix dealer name, manufacturer, and products (split system, heat pump, air conditioning).
- Do NOT invent facts not supported by the page text.
- Return JSON only.`;

export function shouldEnrichBrandWithLlm(entity: BrandEntityResult): boolean {
  if (config.ai.provider === 'mock') return false;
  if (entity.sources.includes('override')) return false;
  if (entity.sources.includes('domain-stem')) return true;
  if (entity.flags.ambiguousGeneric) return true;
  if (entity.needsReview || entity.confidence < 0.85) return true;
  return false;
}

export async function enrichBrandEntityWithLlm(input: {
  entity: BrandEntityResult;
  domain: string;
  pageContext: string;
}): Promise<{ entity: BrandEntityResult; searchTerms: string[] } | null> {
  if (!shouldEnrichBrandWithLlm(input.entity) || !input.pageContext.trim()) {
    return null;
  }

  const domain = input.domain.replace(/^www\./, '');
  const prompt = `Current heuristic brand: ${input.entity.primaryBrand}
Domain: ${domain}
Heuristic aliases: ${input.entity.aliases.slice(0, 5).join(', ') || '(none)'}

Website content:
${input.pageContext.slice(0, 3200)}

Return JSON:
{
  "primaryBrand": "...",
  "aliases": ["..."],
  "businessSummary": "...",
  "searchTerms": ["split system", "air conditioning dealer", ...]
}`;

  try {
    const model = resolvePresenceModel(ai.name);
    const { data } = await ai.generateStructuredOutput({
      schema: BrandEnrichmentSchema,
      schemaName: 'BrandEnrichment',
      system: BRAND_ENRICH_SYSTEM,
      prompt,
      temperature: 0.1,
      ...(model ? { model } : {}),
    });

    const primary = data.primaryBrand.trim();
    const aliasSet = new Set<string>();
    const originalPrimary = input.entity.primaryBrand.trim();
    if (
      originalPrimary.length >= 2 &&
      originalPrimary.toLowerCase() !== primary.toLowerCase()
    ) {
      aliasSet.add(originalPrimary);
    }
    for (const a of [...data.aliases, ...buildBrandAliases(primary)]) {
      const t = a.trim();
      if (t.length >= 2 && t.toLowerCase() !== primary.toLowerCase()) aliasSet.add(t);
    }
    const aliases = [...aliasSet].slice(0, 8);

    const enriched: BrandEntityResult = {
      ...input.entity,
      primaryBrand: primary,
      aliases,
      confidence: Math.max(input.entity.confidence, 0.88),
      needsReview: false,
      sources: [...input.entity.sources, 'llm-brand-enrich'],
    };

    logger.info(
      {
        from: input.entity.primaryBrand,
        to: enriched.primaryBrand,
        searchTerms: data.searchTerms.length,
      },
      'brand entity enriched via LLM',
    );

    return { entity: enriched, searchTerms: data.searchTerms.map((t) => t.trim()).filter(Boolean) };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'brand LLM enrichment failed — using heuristic');
    return null;
  }
}
