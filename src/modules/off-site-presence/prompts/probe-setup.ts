import type { BrandEntityResult } from '../schemas';

export const PROBE_SETUP_SYSTEM = `You prepare an off-site brand presence probe in ONE response.

Tasks (all required):
1. BRAND — Confirm or refine the trading name for off-site search (Reddit, news, reviews).
   - primaryBrand: local dealer/installer name, NOT the manufacturer alone unless the site IS the manufacturer.
   - aliases: abbreviations, manufacturer names, regional terms.
   - businessSummary: one sentence on role, products, region.
2. KEYWORDS — brandKeywords: 5–8 short search terms from page content.
   - KEEP product/service phrases (split system, HVAC dealer).
   - DROP nav words, error codes, bare numbers, meaningless fragments.
3. SEARCH PLAN — Choose platforms, targets, skips, custom queries, additionalSources.

Search plan rules:
- ALWAYS include reddit in probePlatforms and searchTargets; ALWAYS include general and news in searchTargets.
- g2/capterra: B2B SaaS only — skip for automotive, luxury, local installers, dealers, trades.
- trustpilot: national consumer brands — skip for local dealers.
- local_service: HVAC, trades — prioritize news + general + reddit; skip g2, capterra, trustpilot.
- .au domains: include whirlpool, productreview, ozbargain; skip g2/capterra for AU consumer/local.
- customQueries: up to 3 strings with -site:DOMAIN; use product terms not just brand slug.
- skipPlatforms: each omitted platform with reason.

Return JSON only.`;

export function buildProbeSetupPrompt(input: {
  entity: BrandEntityResult;
  domain: string;
  pageContext: string;
  pageHints: string;
  candidateKeywords: string[];
  prefetchedKeywords?: string[];
  enrichBrand: boolean;
}): string {
  const domain = input.domain.replace(/^www\./, '');
  const flags = input.entity.flags;

  return `Domain: ${domain}
Heuristic brand: ${input.entity.primaryBrand}
Heuristic aliases: ${input.entity.aliases.slice(0, 5).join(', ') || '(none)'}
Confidence: ${(input.entity.confidence * 100).toFixed(0)}%
Refine brand name: ${input.enrichBrand ? 'yes — ambiguous or low confidence' : 'no — keep unless clearly wrong on page'}
Marketplace: ${flags.marketplaceMode} | Ambiguous short name: ${flags.ambiguousGeneric}

UI-provided keywords: ${input.prefetchedKeywords?.slice(0, 10).join(', ') || '(none)'}
Candidate keywords from page extraction:
${input.candidateKeywords.map((k) => `- ${k}`).join('\n') || '(none)'}

Website content:
${input.pageContext.slice(0, 3200)}

Page hints (structure):
${input.pageHints.slice(0, 2000) || '(none)'}

Return JSON:
{
  "primaryBrand": "...",
  "aliases": ["..."],
  "businessSummary": "...",
  "category": "local_service" | "automotive" | "b2b_saas" | "consumer_brand" | "marketplace" | "generic",
  "rationale": "...",
  "probePlatforms": ["reddit", ...],
  "searchTargets": ["reddit", "general", "news", ...],
  "skipPlatforms": [{"id": "g2", "reason": "..."}],
  "customQueries": ["\\"Brand\\" product site:reddit.com -site:${domain}"],
  "brandKeywords": ["split system", "..."],
  "additionalSources": [{"id": "github", "host": "github.com", "label": "GitHub", "reason": "..."}]
}`;
}
