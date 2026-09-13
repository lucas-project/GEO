import type { BrandEntityResult } from '../schemas';

export interface SearchPlanPromptInput {
  brand: BrandEntityResult;
  domain: string;
  pageHints?: string;
  siteKeywords?: string[];
}

export const SEARCH_PLAN_SYSTEM = `You plan which off-site platforms to search and probe for a brand.

Output JSON only. Choose platforms that match the brand's industry — do not use B2B software review sites for car manufacturers, luxury brands, or non-SaaS companies.

Rules:
- ALWAYS include reddit in probePlatforms and searchTargets (community signal for every brand).
- ALWAYS include general and news in searchTargets.
- site_search probe is always run by the system — you may include it in probePlatforms.
- g2.com and capterra.com are for B2B software/SaaS only — skip for automotive, luxury, consumer goods, media, local installers, dealers, trades, and retailers (unless they sell downloadable software).
- Do NOT probe G2/Capterra for HVAC dealers, appliance installers, plumbers, electricians, or local retailers.
- trustpilot.com suits national consumer brands with product reviews — skip for local dealers and installers.
- local_service category: HVAC, air conditioning, heat pumps, appliance dealers — prioritize news + general + reddit; skip g2, capterra, trustpilot.
- For Australian brands (domain ends in .au), ALWAYS include whirlpool, productreview, and ozbargain in searchTargets and probePlatforms. Skip g2 and capterra for AU consumer/local brands.
- quora.com suits brands with FAQ/topic discussion value.
- social searchTargets: include only when the brand likely has public social profiles (consumer, luxury, retail).
- customQueries: up to 5 extra search strings using PRODUCT/SERVICE terms (not just the brand slug). Each MUST include -site:DOMAIN excluding the brand's own site.
  Example for HVAC dealer: "\\"Midea\\" \\"split system\\" site:reddit.com -site:example.com.au"
- skipPlatforms: list each platform id you intentionally omit with a short reason.
- brandKeywords: up to 8 short terms customers search (products, services, manufacturer, city). Prefer siteKeywords when provided.
- additionalSources: industry-specific sites to search with site:HOST queries (not standard review platforms). Examples:
  - open source / OSS → github.com, gitlab.com, bitbucket.org
  - developer tools → stackoverflow.com, dev.to
  - SaaS launches → producthunt.com
  - HVAC / trades → productreview.com.au, whirlpool.net.au (AU examples when domain is .au)
  Each entry: { "id": "github", "host": "github.com", "label": "GitHub", "reason": "..." }

Valid probePlatforms: reddit, quora, g2, capterra, trustpilot, site_search, whirlpool, productreview, ozbargain
Valid searchTargets: reddit, quora, g2, capterra, trustpilot, general, news, social, whirlpool, productreview, ozbargain

Extended discovery (always searched): site:xiaohongshu.com, site:zhihu.com, site:tiktok.com, site:amazon.com reviews, site:facebook.com, site:x.com — queries include market country when known from the brand domain.`;

export function buildSearchPlanPrompt(input: SearchPlanPromptInput): string {
  const domain = input.domain.replace(/^www\./, '');
  const flags = input.brand.flags;

  return `Brand: ${input.brand.primaryBrand}
Website domain: ${domain}
Aliases: ${input.brand.aliases.slice(0, 5).join(', ') || '(none)'}
Confidence: ${(input.brand.confidence * 100).toFixed(0)}%
Marketplace mode: ${flags.marketplaceMode}
Ambiguous short name: ${flags.ambiguousGeneric}
Sub-brands: ${flags.subBrands.slice(0, 5).join(', ') || '(none)'}
SameAs URLs: ${input.brand.sameAsUrls.slice(0, 5).join(', ') || '(none)'}
Site keywords (from page analysis): ${input.siteKeywords?.slice(0, 10).join(', ') || '(none yet)'}

Page context:
${input.pageHints?.slice(0, 2800) || '(no page text)'}

Return JSON:
{
  "category": "automotive" | "b2b_saas" | "consumer_brand" | "marketplace" | "local_service" | "generic",
  "rationale": "...",
  "probePlatforms": ["reddit", ...],
  "searchTargets": ["reddit", "general", "news", ...],
  "skipPlatforms": [{"id": "g2", "reason": "..."}],
  "customQueries": ["\\"Midea dealer\\" heat pump site:reddit.com -site:${domain}"],
  "brandKeywords": ["split system", "..."],
  "additionalSources": [{"id": "github", "host": "github.com", "label": "GitHub", "reason": "..."}]
}`;
}

export { extractRichPageContext as extractPageHints } from '../page-context';
