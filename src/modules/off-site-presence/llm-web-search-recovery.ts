import { z } from 'zod';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { BrandEntityResult } from './schemas';
import type { PresenceSearchPlan } from './search-plan-types';
import { shouldOrchestrateSearch } from './search-orchestrator';
import { resolvePresenceModel } from './model';

export const WebSearchRecoverySchema = z.object({
  queries: z.array(z.string()).max(5),
});

export type WebSearchRecoveryOutput = z.infer<typeof WebSearchRecoverySchema>;

const RECOVERY_SYSTEM = `You generate follow-up web search queries to improve a brand's off-site visibility footprint.

Output JSON with "queries": 3-5 NEW search strings. Each query MUST include -site:DOMAIN to exclude the brand's own website.

Guidelines:
- Use quoted brand name when multi-word or ambiguous
- Add industry/disambiguation terms for homonyms
- Try news, press, Wikipedia (site:wikipedia.org), industry publications
- Use brand aliases when the primary name is generic
- Do NOT repeat queries already tried
- Do NOT query platforms listed under skipped platforms
- Prefer breadth (general web) over repeating site:reddit.com unless Reddit gap remains`;

export interface WebSearchRecoveryInput {
  brand: BrandEntityResult;
  domain: string;
  pageHints?: string;
  searchPlan: PresenceSearchPlan;
  queriesTried: string[];
  generalHitEstimate: number;
  offSiteDomainCount: number;
}

function normalizeQuery(q: string, domain: string): string {
  const trimmed = q.trim();
  if (!trimmed) return trimmed;
  const ex = `-site:${domain.replace(/^www\./, '')}`;
  if (trimmed.toLowerCase().includes('-site:')) return trimmed;
  return `${trimmed} ${ex}`;
}

function isQueryAllowed(query: string, plan: PresenceSearchPlan): boolean {
  const lower = query.toLowerCase();
  for (const skip of plan.skipPlatforms) {
    const id = skip.id.toLowerCase();
    if (id === 'g2' && /site:\s*g2\.com/i.test(lower)) return false;
    if (id === 'capterra' && /site:\s*capterra\.com/i.test(lower)) return false;
    if (id === 'trustpilot' && /site:\s*trustpilot\.com/i.test(lower)) return false;
    if (id === 'quora' && /site:\s*quora\.com/i.test(lower)) return false;
    if (id === 'reddit' && /site:\s*reddit\.com/i.test(lower)) return false;
  }
  return true;
}

export function shouldRunWebSearchRecovery(generalHitEstimate: number, offSiteDomainCount: number): boolean {
  return generalHitEstimate < 5 || offSiteDomainCount < 5;
}

export async function generateWebSearchRecoveryQueries(
  input: WebSearchRecoveryInput,
): Promise<string[]> {
  if (!shouldOrchestrateSearch()) return [];

  const domain = input.domain.replace(/^www\./, '');
  const triedSet = new Set(input.queriesTried.map((q) => q.toLowerCase()));
  const skipped =
    input.searchPlan.skipPlatforms.length > 0
      ? input.searchPlan.skipPlatforms.map((s) => `- ${s.id}: ${s.reason}`).join('\n')
      : '(none)';

  const prompt = `Brand: ${input.brand.primaryBrand}
Domain: ${domain}
Category: ${input.searchPlan.category}
Rationale: ${input.searchPlan.rationale}
Brand keywords: ${input.searchPlan.brandKeywords.join(', ') || '(none)'}
Additional vertical sources: ${
    input.searchPlan.additionalSources.map((s) => s.host).join(', ') || '(none)'
  }
Current general hit estimate: ${input.generalHitEstimate}
Off-site domains found: ${input.offSiteDomainCount}

Skipped platforms (do NOT query):
${skipped}

Queries already tried:
${input.queriesTried.map((q) => `- ${q}`).join('\n') || '(none)'}

Page context:
${input.pageHints?.slice(0, 1200) || '(none)'}

Return JSON: { "queries": ["..."] }`;

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: WebSearchRecoverySchema,
      schemaName: 'WebSearchRecovery',
      system: RECOVERY_SYSTEM,
      prompt,
      temperature: 0.25,
      ...(resolvePresenceModel(ai.name) ? { model: resolvePresenceModel(ai.name) } : {}),
    });

    return data.queries
      .map((q) => normalizeQuery(q, domain))
      .filter(
        (q) =>
          q &&
          !triedSet.has(q.toLowerCase()) &&
          isQueryAllowed(q, input.searchPlan),
      )
      .slice(0, 5);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'web search recovery LLM failed');
    return [];
  }
}
