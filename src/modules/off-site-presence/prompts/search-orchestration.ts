import type { BrandEntityResult, PlatformId } from '../schemas';
import type { PresenceSearchPlan } from '../search-plan-types';

export interface OrchestrationStateInput {
  brand: BrandEntityResult;
  domain: string;
  searchPlan: PresenceSearchPlan;
  queriesTried: { query: string; hitCount: number; engine: string }[];
  gaps: {
    probedPlatforms: PlatformId[];
    socialEmpty: boolean;
    webFootprintWeak: boolean;
  };
  generalHitEstimate: number;
  offSiteDomainCount: number;
  topCandidates: { url: string; title?: string; snippet?: string; platform?: string }[];
  round: number;
  maxRounds: number;
}

export const SEARCH_ORCHESTRATION_SYSTEM = `You plan follow-up web search queries to find a brand's off-site presence.

You receive: target brand, website domain, a search plan (which platforms matter), queries already tried, platform gaps, and top URLs found so far.

Output JSON with:
- stop: true when gaps are filled or no productive new queries remain
- reason: short explanation
- nextQueries: up to 4 NEW search strings (never repeat a query already tried)

Rules for nextQueries:
- Always append -site:DOMAIN to exclude the brand's own website
- NEVER query platforms listed under "Skipped platforms" in the search plan
- Only use site:PLATFORM for platforms still listed as missing gaps
- For automotive/luxury brands prefer news and industry press queries over B2B software review sites
- For homonyms add disambiguation (industry, product type, country)
- For missing social use "Brand Name" facebook|linkedin|youtube -site:domain.com
- Use quoted brand name when the brand is multi-word or ambiguous
- Do not invent URLs; only suggest search queries
- When webFootprintWeak is true, prioritize general web breadth: news, Wikipedia (site:wikipedia.org), industry press, aliases — do NOT set stop:true until footprint is stronger
- When brandKeywords or additionalSources are listed, use site:HOST queries for those vertical sources`;

export function buildSearchOrchestrationPrompt(input: OrchestrationStateInput): string {
  const domain = input.domain.replace(/^www\./, '');
  const tried =
    input.queriesTried.length > 0
      ? input.queriesTried.map((q) => `- "${q.query}" → ${q.hitCount} hits (${q.engine})`).join('\n')
      : '(none)';

  const gaps =
    input.gaps.probedPlatforms.length > 0
      ? input.gaps.probedPlatforms.join(', ')
      : 'none (probed platforms covered)';

  const candidates =
    input.topCandidates.length > 0
      ? input.topCandidates
          .slice(0, 12)
          .map((c, i) => {
            const parts = [`${i + 1}. ${c.url}`];
            if (c.title) parts.push(`title: ${c.title.slice(0, 80)}`);
            if (c.platform) parts.push(`platform: ${c.platform}`);
            return parts.join(' | ');
          })
          .join('\n')
      : '(no candidates yet)';

  const skipped =
    input.searchPlan.skipPlatforms.length > 0
      ? input.searchPlan.skipPlatforms.map((s) => `- ${s.id}: ${s.reason}`).join('\n')
      : '(none)';

  return `Round ${input.round} of ${input.maxRounds}

Target brand: ${input.brand.primaryBrand}
Website domain: ${domain}
Aliases: ${input.brand.aliases.slice(0, 5).join(', ') || '(none)'}

Search plan category: ${input.searchPlan.category}
Plan rationale: ${input.searchPlan.rationale}
Allowed search targets: ${input.searchPlan.searchTargets.join(', ')}
Skipped platforms (do NOT query):
${skipped}

Queries already tried:
${tried}

Missing probed platforms (no URL found yet): ${gaps}
Social profiles found: ${input.gaps.socialEmpty ? 'none' : 'some'}
Web footprint weak (need more general off-site hits): ${input.gaps.webFootprintWeak ? 'yes' : 'no'}
General hit estimate: ${input.generalHitEstimate}
Off-site domains found: ${input.offSiteDomainCount}
Brand keywords: ${input.searchPlan.brandKeywords.join(', ') || '(none)'}
Additional vertical sources: ${
    input.searchPlan.additionalSources.map((s) => `${s.label} (${s.host})`).join(', ') || '(none)'
  }

Top candidate URLs:
${candidates}

Return JSON: { "stop": boolean, "reason": string, "nextQueries": string[] }`;
}
