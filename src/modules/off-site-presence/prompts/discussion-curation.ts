import type { SearchPlanCategory } from '../search-plan-types';
import type { MarketCountry } from '../market-country';
import type { DiscussionPlatform } from '../discussion-value-score';

export const DISCUSSION_CURATION_SYSTEM = `You are the final editor for public discussions about a brand in a GEO presence report.

You receive candidate posts from web search (Reddit or Facebook). Most candidates are NOISE. KEEP only discussions a human analyst would say are clearly about the target business.

DECISION RULES (any industry, any brand):

KEEP when the title clearly relates to:
- The exact target brand or a listed alias
- The company's products/services from site keywords
- The target website domain or an obvious local dealer/installer

REJECT when:
- Different person, meme, celebrity, sport, entertainment, or unrelated viral topic
- Look-alike words (homonym, phonetic spelling) without industry context
- No meaningful brand, domain, or keyword connection
- Spam, [deleted], or titles under ~12 characters
- For Reddit: subreddit obviously unrelated to the brand industry

Engagement (likes, comments) is a weak signal — high engagement off-topic posts must still be REJECTED.

When a primary market country is given, PREFER posts clearly about that region. For Australian brands, heavily prioritize Whirlpool, ProductReview, and OzBargain community threads.

Prefer up to ~15 strong keeps for Reddit; when uncertain, REJECT.
Non-English titles are valid when they clearly mention the brand, domain, or site keywords.

Return JSON only with exact URLs from the candidate list.`;

export function buildDiscussionCurationPrompt(input: {
  platform: DiscussionPlatform;
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
    upvotes?: number;
    likes?: number;
    comments?: number;
  }>;
}): string {
  const platformLabel =
    input.platform === 'facebook'
      ? 'Facebook'
      : input.platform === 'generic'
        ? 'Social / community (any platform)'
        : 'Reddit';
  const lines = input.posts.map((p, i) => {
    const engagement =
      input.platform === 'facebook'
        ? `likes: ${p.likes ?? 0}, comments: ${p.comments ?? 0}`
        : `upvotes: ${p.upvotes ?? 0}, comments: ${p.comments ?? 0}`;
    const parts = [
      `${i + 1}. title: ${p.title}`,
      p.subreddit ? `subreddit: r/${p.subreddit}` : null,
      p.url ? `url: ${p.url}` : null,
      engagement,
    ].filter(Boolean);
    return parts.join(' | ');
  });

  const industryHint =
    input.searchPlanCategory === 'local_service'
      ? 'Industry: local service / trades / dealer.'
      : input.searchPlanCategory
        ? `Industry category: ${input.searchPlanCategory}`
        : '(not specified)';

  const marketBlock = input.marketCountry
    ? `Primary market (from website domain): ${input.marketCountry.name} (${input.marketCountry.code})
Prioritize discussions about this country/region.`
    : '';

  return `Platform: ${platformLabel}
Target brand: ${input.brand}
Website domain: ${input.domain.replace(/^www\./, '')}
${marketBlock ? `${marketBlock}\n` : ''}${industryHint}
${input.searchPlanRationale ? `Plan rationale: ${input.searchPlanRationale}` : ''}

Brand aliases: ${input.aliases.slice(0, 8).join(', ') || '(none)'}

Site keywords:
${input.siteKeywords.slice(0, 12).join(', ') || '(use brand and domain only)'}

Candidate posts (${input.posts.length}) — only keep URLs from this list:
${lines.join('\n')}

Return JSON: { "keep": [{ "url": string, "reason": string }], "reject": [{ "url": string, "reason": string }] }`;
}
