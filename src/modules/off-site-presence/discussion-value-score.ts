import { recencyBoost } from './engagement';
import type { MarketCountry } from './market-country';
import { scoreRedditPostMarketRelevance } from './market-country';

export type DiscussionPlatform = 'reddit' | 'facebook' | 'generic';

export type DiscussionValueSignals = {
  brand: number;
  domain: number;
  keywords: number;
  engagement: number;
  market: number;
  recency: number;
};

export type DiscussionPostInput = {
  title: string;
  url?: string;
  platform: DiscussionPlatform;
  upvotes?: number;
  likes?: number;
  comments?: number;
  awards?: number;
  publishedAt?: string;
  subreddit?: string;
};

export type DiscussionValueContext = {
  brand: string;
  domain: string;
  aliases?: string[];
  siteKeywords?: string[];
  marketCountry?: MarketCountry | null;
};

const BRAND_FULL = 100;
const BRAND_ALIAS = 60;
const DOMAIN_STEM = 40;
const KEYWORD_PHRASE = 50;
const COMMENT_EACH = 8;
const COMMENT_MAX = 80;
const LIKE_EACH = 2;
const LIKE_MAX = 60;
const AWARD_EACH = 15;
const AWARD_MAX = 30;
const MARKET_LOCAL = 25;
const MARKET_FOREIGN = -40;

function domainStem(domain: string): string {
  return domain.replace(/^www\./, '').split('.')[0]?.toLowerCase() ?? '';
}

function scoreBrand(title: string, ctx: DiscussionValueContext): number {
  const t = title.toLowerCase();
  const brand = ctx.brand.trim().toLowerCase();
  if (brand.length >= 3 && t.includes(brand)) return BRAND_FULL;
  for (const alias of ctx.aliases ?? []) {
    const a = alias.trim().toLowerCase();
    if (a.length >= 3 && t.includes(a)) return BRAND_ALIAS;
  }
  return 0;
}

function scoreDomain(post: DiscussionPostInput, ctx: DiscussionValueContext): number {
  const stem = domainStem(ctx.domain);
  if (stem.length < 4) return 0;
  const blob = `${post.title} ${post.url ?? ''}`.toLowerCase();
  return blob.includes(stem) ? DOMAIN_STEM : 0;
}

function scoreKeywords(title: string, ctx: DiscussionValueContext): number {
  let best = 0;
  for (const kw of ctx.siteKeywords ?? []) {
    const phrase = kw.trim().toLowerCase();
    if (phrase.length < 4) continue;
    if (phrase.includes(' ') && title.toLowerCase().includes(phrase)) {
      best = Math.max(best, KEYWORD_PHRASE);
    }
  }
  return best;
}

function scoreEngagement(
  post: DiscussionPostInput,
  ctx: DiscussionValueContext,
): number {
  const comments = Math.min(COMMENT_MAX, (post.comments ?? 0) * COMMENT_EACH);
  const likes =
    post.platform === 'facebook' || post.platform === 'generic'
      ? Math.min(LIKE_MAX, (post.likes ?? 0) * LIKE_EACH)
      : Math.min(LIKE_MAX, (post.upvotes ?? 0) * LIKE_EACH);
  const awards =
    post.platform === 'reddit'
      ? Math.min(AWARD_MAX, (post.awards ?? 0) * AWARD_EACH)
      : 0;
  const raw = comments + likes + awards;
  const onTopic =
    scoreBrand(post.title, ctx) > 0 ||
    scoreDomain(post, ctx) > 0 ||
    scoreKeywords(post.title, ctx) > 0;
  if (!onTopic) return Math.min(raw, 15);
  return raw;
}

function scoreMarket(post: DiscussionPostInput, ctx: DiscussionValueContext): number {
  if (!ctx.marketCountry || post.platform !== 'reddit') return 0;
  const rel = scoreRedditPostMarketRelevance(
    { title: post.title, subreddit: post.subreddit },
    ctx.marketCountry,
  );
  if (rel >= 2) return MARKET_LOCAL;
  if (rel === 0) return MARKET_FOREIGN;
  return 0;
}

function scoreRecency(post: DiscussionPostInput): number {
  return Math.round(recencyBoost(post.publishedAt) * 10);
}

export function computeDiscussionValueScore(
  post: DiscussionPostInput,
  ctx: DiscussionValueContext,
): { valueScore: number; valueSignals: DiscussionValueSignals } {
  const valueSignals: DiscussionValueSignals = {
    brand: scoreBrand(post.title, ctx),
    domain: scoreDomain(post, ctx),
    keywords: scoreKeywords(post.title, ctx),
    engagement: scoreEngagement(post, ctx),
    market: scoreMarket(post, ctx),
    recency: scoreRecency(post),
  };
  const valueScore = Object.values(valueSignals).reduce((a, b) => a + b, 0);
  return { valueScore, valueSignals };
}

export function rankDiscussionsByValue<T extends DiscussionPostInput>(
  posts: T[],
  ctx: DiscussionValueContext,
  maxItems = 32,
): Array<T & { valueScore: number; valueSignals: DiscussionValueSignals }> {
  const scored = posts.map((p) => {
    const { valueScore, valueSignals } = computeDiscussionValueScore(p, ctx);
    return { ...p, valueScore, valueSignals };
  });
  scored.sort((a, b) => b.valueScore - a.valueScore);
  return scored.slice(0, maxItems);
}
