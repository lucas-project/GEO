import type { BrandEntityResult } from '../schemas';

export interface SearchCurationCandidateInput {
  url: string;
  title?: string;
  snippet?: string;
  platform?: string;
  sourceQuery?: string;
}

export const SEARCH_CURATION_SYSTEM = `You curate off-site search results for brand presence analysis.

Given a target brand, website domain, and candidate URLs from web search, decide which URLs to KEEP vs REJECT.

KEEP when the URL is likely:
- The brand's official profile on a platform (Facebook, LinkedIn, G2, etc.)
- A review listing for this exact company/domain (Trustpilot, G2, Capterra)
- On-topic community discussion clearly about this brand (Reddit, Quora)

REJECT when the URL is:
- On the brand's own website domain or a subdomain
- A different company with a similar name (homonym)
- A dealer, reseller, fan page, or unofficial account (unless clearly discussing THIS brand)
- Generic news/aggregator with no clear brand ownership
- Login, help, or platform home pages without a brand profile
- Clearly non-English titles/snippets (unless the brand is explicitly non-English)
- Reddit/Quora threads that do not mention the brand name, domain, or any provided site keyword

Rules:
- Default to English-only keeps unless the brand locale is clearly non-English.
- For Reddit and Quora: title or snippet must mention brand name, website domain, or at least one site keyword.
- Only keep URLs from the candidate list (exact URL match).
- confidence: 0.0–1.0 (how sure this belongs to the target brand).
- platform: optional label (reddit, g2, facebook, linkedin, etc.) when obvious from the URL.
- Prefer fewer high-confidence keeps over many weak matches.`;

export function buildSearchCurationPrompt(input: {
  brand: BrandEntityResult;
  domain: string;
  siteKeywords?: string[];
  candidates: SearchCurationCandidateInput[];
}): string {
  const lines = input.candidates.map((c, i) => {
    const parts = [`${i + 1}. url: ${c.url}`];
    if (c.title) parts.push(`title: ${c.title}`);
    if (c.snippet) parts.push(`snippet: ${c.snippet.slice(0, 200)}`);
    if (c.platform) parts.push(`platform: ${c.platform}`);
    if (c.sourceQuery) parts.push(`query: ${c.sourceQuery}`);
    return parts.join(' | ');
  });

  return `Target brand: ${input.brand.primaryBrand}
Website domain: ${input.domain.replace(/^www\./, '')}
Aliases: ${input.brand.aliases.slice(0, 5).join(', ') || '(none)'}
Site keywords (must appear in Reddit/Quora keeps when relevant): ${input.siteKeywords?.slice(0, 8).join(', ') || '(none)'}

Candidates (${input.candidates.length}):
${lines.join('\n')}

Return JSON: { "keep": [{ "url": string, "platform"?: string, "confidence": number, "reason": string }], "reject": [{ "url": string, "reason": string }] }`;
}
