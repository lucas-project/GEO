import type { CrossPlatformPost, FacebookPost, RedditPost } from './schemas';
import {
  computeDiscussionValueScore,
  type DiscussionValueContext,
} from './discussion-value-score';

const PROMO_RE = /\b(deal|sale|coupon|discount code|promo)\b/i;
const COMPARE_RE = /\b(vs\.?|versus|compared to|better than)\b/i;

export function recencyBoost(publishedAt?: string): number {
  if (!publishedAt) return 0.7;
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return 0.7;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 1.5;
  if (days <= 30) return 1.2;
  if (days <= 90) return 1.0;
  if (days <= 365) return 0.7;
  return 0.4;
}

export function classifyPost(title: string): RedditPost['category'] {
  const t = title.toLowerCase();
  if (COMPARE_RE.test(t)) return 'purchase';
  if (/\b(love|hate|worst|best brand|recommend)\b/.test(t)) return 'sentiment';
  if (/\b(buy|price|worth|purchase)\b/.test(t)) return 'purchase';
  if (/\b(industry|market|sector)\b/.test(t)) return 'industry';
  if (/\b(review|feature|model|version)\b/.test(t)) return 'product';
  return 'other';
}

export function computeEngagementScore(post: RedditPost): number {
  const boost = recencyBoost(post.publishedAt);
  return (
    post.upvotes * 0.4 +
    post.comments * 10 * 0.35 +
    post.awards * 50 * 0.15 +
    boost * 0.1 * 100
  );
}

export function passesEngagementFilter(post: RedditPost): boolean {
  if (post.upvotes <= 10 || post.comments <= 5) return false;
  if (PROMO_RE.test(post.title)) return false;
  return true;
}

export const REDDIT_DISPLAY_TARGET = 10;
export const CROSS_PLATFORM_DISPLAY_TARGET = 10;

export function passesDisplayEngagementFilter(post: RedditPost): boolean {
  if (post.upvotes < 5 && post.comments < 3) return false;
  if (PROMO_RE.test(post.title)) return false;
  return true;
}

export function passesRelaxedDisplayEngagementFilter(post: RedditPost): boolean {
  if (PROMO_RE.test(post.title)) return false;
  return post.upvotes >= 3 || post.comments >= 2;
}

function scoreRedditForDisplay(post: RedditPost, ctx: DiscussionValueContext): RedditPost {
  const { valueScore, valueSignals } = computeDiscussionValueScore(
    {
      platform: 'reddit',
      title: post.title,
      url: post.url,
      upvotes: post.upvotes,
      comments: post.comments,
      awards: post.awards,
      publishedAt: post.publishedAt,
      subreddit: post.subreddit,
    },
    ctx,
  );
  return {
    ...post,
    isComparison: COMPARE_RE.test(post.title),
    category: classifyPost(post.title),
    engagementScore: computeEngagementScore(post),
    valueScore,
    valueSignals,
  };
}

export function rankRedditPosts(posts: RedditPost[]): RedditPost[] {
  const scored = posts
    .filter(passesEngagementFilter)
    .map((p) => ({
      ...p,
      isComparison: COMPARE_RE.test(p.title),
      category: classifyPost(p.title),
      engagementScore: computeEngagementScore(p),
    }))
    .sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0));

  return scored.slice(0, 10);
}

export function countHighEngagementPosts(posts: RedditPost[]): number {
  return posts.filter(passesEngagementFilter).length;
}

export function passesFacebookDisplayFilter(post: FacebookPost): boolean {
  if ((post.title?.trim().length ?? 0) < 12) return false;
  if (PROMO_RE.test(post.title)) return false;
  return true;
}

export function rankRedditPostsForDisplay(
  posts: RedditPost[],
  ctx: DiscussionValueContext,
): RedditPost[] {
  const scored = posts.map((p) => scoreRedditForDisplay(p, ctx));
  scored.sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0));

  const picked: RedditPost[] = [];
  const seen = new Set<string>();

  const tryAdd = (list: RedditPost[], filter: (p: RedditPost) => boolean) => {
    for (const p of list) {
      if (picked.length >= REDDIT_DISPLAY_TARGET) break;
      const key = p.url ?? p.title;
      if (seen.has(key)) continue;
      if (!filter(p)) continue;
      seen.add(key);
      picked.push(p);
    }
  };

  tryAdd(scored, passesDisplayEngagementFilter);
  if (picked.length < REDDIT_DISPLAY_TARGET) {
    tryAdd(scored, passesRelaxedDisplayEngagementFilter);
  }
  if (picked.length < REDDIT_DISPLAY_TARGET) {
    for (const p of scored) {
      if (picked.length >= REDDIT_DISPLAY_TARGET) break;
      const key = p.url ?? p.title;
      if (seen.has(key)) continue;
      if (PROMO_RE.test(p.title)) continue;
      seen.add(key);
      picked.push(p);
    }
  }

  return picked;
}

export function redditDisplayShortfall(displayCount: number): number {
  return Math.max(0, REDDIT_DISPLAY_TARGET - displayCount);
}

export function rankFacebookPostsForDisplay(
  posts: FacebookPost[],
  ctx: DiscussionValueContext,
): FacebookPost[] {
  const scored = posts
    .filter(passesFacebookDisplayFilter)
    .map((p) => {
      const { valueScore, valueSignals } = computeDiscussionValueScore(
        {
          platform: 'facebook',
          title: p.title,
          url: p.url,
          likes: p.likes,
          comments: p.comments,
          publishedAt: p.publishedAt,
        },
        ctx,
      );
      return {
        ...p,
        engagementScore: (p.likes ?? 0) * 2 + (p.comments ?? 0) * 8,
        valueScore,
        valueSignals,
      };
    });

  scored.sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0));
  return scored.slice(0, 24);
}

export function rankCrossPlatformPostsForDisplay(
  posts: CrossPlatformPost[],
  ctx: DiscussionValueContext,
): CrossPlatformPost[] {
  const scored = posts.map((p) => {
    const { valueScore, valueSignals } = computeDiscussionValueScore(
      {
        platform: 'generic',
        title: p.title,
        url: p.url,
        likes: p.likes,
        comments: p.comments,
        upvotes: p.upvotes,
      },
      ctx,
    );
    return { ...p, valueScore, valueSignals };
  });
  scored.sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0));
  return scored.slice(0, CROSS_PLATFORM_DISPLAY_TARGET);
}

export function crossPlatformDisplayShortfall(displayCount: number): number {
  return Math.max(0, CROSS_PLATFORM_DISPLAY_TARGET - displayCount);
}

/** Convert SERP reddit hits into lightweight posts for display merging. */
export function redditHitsToPosts(
  hits: { url: string; title?: string }[],
): RedditPost[] {
  const posts: RedditPost[] = [];
  for (const hit of hits) {
    if (!hit.title || !/reddit\.com/i.test(hit.url)) continue;
    const subMatch = /reddit\.com\/r\/([^/]+)/i.exec(hit.url);
    posts.push({
      title: hit.title,
      subreddit: subMatch?.[1],
      upvotes: 5,
      comments: 3,
      awards: 0,
      url: hit.url,
    });
  }
  return posts;
}

function normalizeRedditUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const commentMatch = /\/comments\/([a-z0-9]+)/i.exec(u.pathname);
    if (commentMatch?.[1]) {
      return `${host}/comments/${commentMatch[1]}`;
    }
    return `${host}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function dedupeRedditPosts(posts: RedditPost[]): RedditPost[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: RedditPost[] = [];
  for (const p of posts) {
    const urlKey = normalizeRedditUrl(p.url);
    const titleKey = p.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (urlKey && seenUrl.has(urlKey)) continue;
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (urlKey) seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(p);
  }
  return out;
}
