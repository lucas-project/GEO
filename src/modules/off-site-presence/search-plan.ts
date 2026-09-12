import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { BrandEntityResult, PlatformId } from './schemas';
import type { EntityPageInput } from './resolve-entity';
import {
  platformsForCategory,
  searchTargetsForCategory,
  skipPlatformsForCategory,
  UNIVERSAL_PROBE_IDS,
} from './platform-registry';
import {
  PresenceSearchPlanSchema,
  SearchPlanLlmOutputSchema,
  type PresenceSearchPlan,
  type SearchPlanCategory,
} from './search-plan-types';
import {
  inferAdditionalSources,
  mergeAdditionalSources,
} from './keyword-source-registry';
import {
  SEARCH_PLAN_SYSTEM,
  buildSearchPlanPrompt,
} from './prompts/search-plan';
import { extractPageHints } from './page-context';
import { resolvePresenceModel } from './model';

export type { PresenceSearchPlan, SearchPlanCategory } from './search-plan-types';
export { PresenceSearchPlanSchema } from './search-plan-types';

const LOCAL_SERVICE_RE =
  /\b(hvac|air\s*con|air\s*conditioning|heat\s*pump|split\s*system|appliance\s+dealer|authorised\s+dealer|authorized\s+dealer|installation|plumbing|electrical\s+contractor|midea|daikin|mitsubishi)\b/i;
const AUTOMOTIVE_RE =
  /\b(automotive|automobile|car manufacturer|luxury car|supercar|vehicle|motorsport|ferrari|porsche|lamborghini)\b/i;
const B2B_RE =
  /\b(b2b\s+saas|saas\s+software|enterprise\s+software|software\s+as\s+a\s+service|crm|erp)\b/i;
const SAAS_SCHEMA = /SoftwareApplication|WebApplication/i;

export function shouldUseLlmSearchPlan(): boolean {
  return config.presenceProbe.searchPlanEnabled && config.ai.provider !== 'mock';
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./, '');
}

function ensureUniversalProbePlatforms(ids: PlatformId[]): PlatformId[] {
  const set = new Set<PlatformId>(ids);
  for (const id of UNIVERSAL_PROBE_IDS) set.add(id);
  return [...set];
}

function ensureUniversalSearchTargets(targets: string[]): string[] {
  const set = new Set(targets);
  set.add('reddit');
  set.add('general');
  set.add('news');
  return [...set];
}

function enrichAdditionalSources(
  plan: Pick<PresenceSearchPlan, 'category' | 'additionalSources' | 'brandKeywords'>,
  pageHints: string,
  brandName: string,
): { additionalSources: PresenceSearchPlan['additionalSources']; brandKeywords: string[] } {
  const heuristic = inferAdditionalSources({
    pageHints,
    brandKeywords: plan.brandKeywords,
    category: plan.category,
    brandName,
  });
  return {
    additionalSources: mergeAdditionalSources(plan.additionalSources, heuristic),
    brandKeywords: plan.brandKeywords.slice(0, 8),
  };
}

export function sanitizeLlmPlan(
  raw: ReturnType<typeof SearchPlanLlmOutputSchema.parse>,
  domain: string,
  pageHints: string,
  brandName: string,
): PresenceSearchPlan {
  const probePlatforms = ensureUniversalProbePlatforms(raw.probePlatforms);
  const searchTargets = ensureUniversalSearchTargets(raw.searchTargets);
  if (domain.endsWith('.au')) {
    probePlatforms.push('whirlpool', 'productreview', 'ozbargain');
    searchTargets.push('whirlpool', 'productreview', 'ozbargain');
  }
  const customQueries = raw.customQueries
    .map((q) => normalizeCustomQuery(q, domain))
    .filter(Boolean)
    .slice(0, 3);

  const base = {
    category: raw.category,
    rationale: raw.rationale,
    probePlatforms,
    searchTargets,
    skipPlatforms: raw.skipPlatforms,
    customQueries,
    additionalSources: raw.additionalSources ?? [],
    brandKeywords: raw.brandKeywords ?? [],
    source: 'llm' as const,
  };
  const enriched = enrichAdditionalSources(base, pageHints, brandName);

  return applySkipFilter(
    PresenceSearchPlanSchema.parse({
      ...base,
      ...enriched,
    }),
  );
}

/** Merge UI-detected site keywords into plan and refresh vertical sources. */
export function mergeSiteKeywordsIntoPlan(
  plan: PresenceSearchPlan,
  siteKeywords: string[],
  pageHints: string,
  brandName: string,
): PresenceSearchPlan {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...siteKeywords, ...plan.brandKeywords]) {
    const k = raw.trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    merged.push(k);
    if (merged.length >= 8) break;
  }

  const base = { ...plan, brandKeywords: merged };
  const enriched = enrichAdditionalSources(base, pageHints, brandName);
  return applySkipFilter(
    PresenceSearchPlanSchema.parse({
      ...base,
      ...enriched,
    }),
  );
}

/** Remove skipped platform IDs from probe/search lists (LLM may re-add them). */
export function applySkipFilter(plan: PresenceSearchPlan): PresenceSearchPlan {
  const skipIds = new Set(plan.skipPlatforms.map((s) => s.id));
  return PresenceSearchPlanSchema.parse({
    ...plan,
    probePlatforms: plan.probePlatforms.filter((id) => !skipIds.has(id)),
    searchTargets: plan.searchTargets.filter((t) => !skipIds.has(t)),
  });
}

function normalizeCustomQuery(q: string, domain: string): string {
  const trimmed = q.trim();
  if (!trimmed) return '';
  const ex = `-site:${normalizeDomain(domain)}`;
  if (trimmed.toLowerCase().includes('-site:')) return trimmed;
  return `${trimmed} ${ex}`;
}

export function resolveHeuristicSearchPlan(input: {
  brand: BrandEntityResult;
  domain: string;
  pages?: EntityPageInput[];
}): PresenceSearchPlan {
  const pageText = extractPageHints(input.pages);
  const combined = `${pageText} ${input.brand.primaryBrand} ${input.brand.aliases.join(' ')}`;
  const schemaText = (input.pages ?? [])
    .flatMap((p) => p.schemas ?? [])
    .map((s) => s.type)
    .join(' ');

  let category: SearchPlanCategory = 'generic';

  if (input.brand.flags.marketplaceMode) {
    category = 'marketplace';
  } else if (LOCAL_SERVICE_RE.test(combined)) {
    category = 'local_service';
  } else if (AUTOMOTIVE_RE.test(combined)) {
    category = 'automotive';
  } else if (B2B_RE.test(combined) || SAAS_SCHEMA.test(schemaText)) {
    category = 'b2b_saas';
  } else if (input.brand.flags.ambiguousGeneric) {
    category = 'consumer_brand';
  }

  const base = {
    category,
    rationale: `Heuristic plan for ${category} based on page signals and brand flags`,
    probePlatforms: platformsForCategory(category, input.domain),
    searchTargets: searchTargetsForCategory(category, input.domain),
    skipPlatforms: skipPlatformsForCategory(category),
    customQueries: [] as string[],
    additionalSources: [] as PresenceSearchPlan['additionalSources'],
    brandKeywords: [] as string[],
    source: 'heuristic' as const,
  };
  const enriched = enrichAdditionalSources(base, pageText, input.brand.primaryBrand);

  return applySkipFilter(
    PresenceSearchPlanSchema.parse({
      ...base,
      ...enriched,
    }),
  );
}

export interface ResolveSearchPlanInput {
  brand: BrandEntityResult;
  domain: string;
  pages?: EntityPageInput[];
  /** Keywords detected from the website (workspace bar / presence UI). */
  siteKeywords?: string[];
}

function applySiteKeywordsIfAny(
  plan: PresenceSearchPlan,
  input: ResolveSearchPlanInput,
): PresenceSearchPlan {
  if (!input.siteKeywords?.length) return plan;
  const pageHints = extractPageHints(input.pages);
  return mergeSiteKeywordsIntoPlan(
    plan,
    input.siteKeywords,
    pageHints,
    input.brand.primaryBrand,
  );
}

export async function resolveSearchPlan(
  input: ResolveSearchPlanInput,
): Promise<PresenceSearchPlan> {
  const pageHints = extractPageHints(input.pages);

  if (!shouldUseLlmSearchPlan()) {
    return applySiteKeywordsIfAny(resolveHeuristicSearchPlan(input), input);
  }

  const domain = normalizeDomain(input.domain);

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: SearchPlanLlmOutputSchema,
      schemaName: 'SearchPlan',
      system: SEARCH_PLAN_SYSTEM,
      prompt: buildSearchPlanPrompt({
        brand: input.brand,
        domain,
        pageHints,
        siteKeywords: input.siteKeywords,
      }),
      temperature: 0.2,
      ...(resolvePresenceModel(ai.name) ? { model: resolvePresenceModel(ai.name) } : {}),
    });
    return applySiteKeywordsIfAny(
      sanitizeLlmPlan(data, domain, pageHints, input.brand.primaryBrand),
      input,
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'search plan LLM failed — using heuristic');
    return applySiteKeywordsIfAny(resolveHeuristicSearchPlan(input), input);
  }
}
