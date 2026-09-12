import type { SearchPlanCategory } from '../search-plan-types';
import type { MarketCountry } from '../market-country';

export const REDDIT_CURATION_SYSTEM = `You are the final editor for "threads people discuss this brand on" in a GEO presence report.

You receive candidate Reddit posts from web search and probes. Most candidates are NOISE. Your job is to KEEP only threads that a human analyst would say are clearly about the target business.

DECISION RULES (apply to any industry, any brand):

KEEP only when the title (and subreddit if shown) makes it likely the thread is about:
- The exact target brand or a listed alias
- The target company's products/services described by the site keywords
- The target website domain or an obvious local dealer/installer for that brand

REJECT when:
- The title is about a different person, place, meme, celebrity, sport, entertainment, or unrelated viral topic
- The title only matches a look-alike word (phonetic spelling, pinyin, homonym, substring) — e.g. a brand "Midea" is NOT the same as unrelated "Meidi" in battlerap or person names unless HVAC/appliance context is explicit
- The title does not mention the brand, domain, or any site keyword concept in a meaningful way
- Clearly non-English title unless the brand's market is explicitly non-English
- Spam, [deleted], giveaways, or titles under ~12 characters with no substance
- Subreddit is obviously unrelated to the brand's industry (use site keywords and category as context)

Use subreddit and engagement as weak signals only — a high-upvote unrelated thread must still be REJECTED.

Be strict on topic, but when the target market country is given, PREFER keeps that clearly relate to that country (local install, dealer, regulations, climate) over generic US/global threads unless the thread is strongly about the brand/products.

Prefer up to ~20 strong keeps when available; still REJECT clear noise. When uncertain, REJECT.

Return JSON only with exact URLs from the candidate list.`;

export function buildRedditCurationPrompt(input: {
  brand: string;
  domain: string;
  aliases: string[];
  siteKeywords: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  posts: Array<{
    url?: string;
    title: string;
    subreddit?: string;
    upvotes: number;
    comments: number;
  }>;
}): string {
  const lines = input.posts.map((p, i) => {
    const parts = [
      `${i + 1}. title: ${p.title}`,
      p.subreddit ? `subreddit: r/${p.subreddit}` : null,
      p.url ? `url: ${p.url}` : null,
      `upvotes: ${p.upvotes}, comments: ${p.comments}`,
    ].filter(Boolean);
    return parts.join(' | ');
  });

  const industryHint =
    input.searchPlanCategory === 'local_service'
      ? 'Industry: local service / trades / dealer (not national SaaS review sites).'
      : input.searchPlanCategory
        ? `Industry category: ${input.searchPlanCategory}`
        : '(not specified)';

  const marketBlock = input.marketCountry
    ? `Primary market (from website domain): ${input.marketCountry.name} (${input.marketCountry.code})
Prioritize threads about this country/region. REJECT or deprioritize threads clearly about other countries unless they still clearly discuss the target brand in that foreign context.`
    : '';

  return `Target brand: ${input.brand}
Website domain: ${input.domain.replace(/^www\./, '')}
${marketBlock ? `${marketBlock}\n` : ''}${industryHint}
${input.searchPlanRationale ? `Plan rationale: ${input.searchPlanRationale}` : ''}

Brand aliases (same company): ${input.aliases.slice(0, 8).join(', ') || '(none)'}

Site keywords — thread must clearly relate to the brand or these topics:
${input.siteKeywords.slice(0, 12).join(', ') || '(use brand and domain only)'}

Candidate threads (${input.posts.length}) — only keep URLs from this list:
${lines.join('\n')}

Return JSON: { "keep": [{ "url": string, "reason": string }], "reject": [{ "url": string, "reason": string }] }`;
}
