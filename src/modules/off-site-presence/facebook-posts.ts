import type { SearchHit } from './search-engine';
import type { FacebookPost } from './schemas';

const FB_POST_PATH =
  /\/(posts|photos|videos|watch|permalink|story|reel|share|groups\/[^/]+\/permalink)/i;

export function isFacebookPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('facebook.com') && !host.includes('fb.com')) return false;
    if (FB_POST_PATH.test(u.pathname)) return true;
    if (/[?&]story_fbid=/i.test(u.search)) return true;
    if (/[?&]fbid=/i.test(u.search)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isFacebookProfileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('facebook.com')) return false;
    if (isFacebookPostUrl(url)) return false;
    if (/^\/(login|reg|help|watch|gaming|marketplace|groups)\b/i.test(u.pathname)) {
      return false;
    }
    return u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Parse likes/comments from SERP snippet when present. */
export function parseEngagementFromSnippet(snippet?: string): {
  likes: number;
  comments: number;
} {
  if (!snippet) return { likes: 0, comments: 0 };
  const text = snippet.toLowerCase();
  let likes = 0;
  let comments = 0;

  const commentMatch =
    /(\d[\d,.]*)\s*(comments?|replies)/i.exec(text) ??
    /(\d[\d,.]*)\s*k\s*comments?/i.exec(text);
  if (commentMatch?.[1]) {
    comments = parseEngagementNumber(commentMatch[1], commentMatch[0]);
  }

  const likeMatch =
    /(\d[\d,.]*)\s*(likes?|reactions?)/i.exec(text) ??
    /(\d[\d,.]*)\s*k\s*likes?/i.exec(text);
  if (likeMatch?.[1]) {
    likes = parseEngagementNumber(likeMatch[1], likeMatch[0]);
  }

  return { likes, comments };
}

function parseEngagementNumber(raw: string, context: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  if (/k\b/i.test(context)) return Math.round(n * 1000);
  return Math.round(n);
}

export function facebookHitsToPosts(hits: SearchHit[]): FacebookPost[] {
  const posts: FacebookPost[] = [];
  for (const hit of hits) {
    if (!isFacebookPostUrl(hit.url)) continue;
    const title =
      hit.title?.trim() ||
      hit.snippet?.trim().slice(0, 200) ||
      'Facebook discussion';
    if (title.length < 3) continue;
    const { likes, comments } = parseEngagementFromSnippet(hit.snippet);
    posts.push({
      platform: 'facebook',
      title,
      url: hit.url,
      likes,
      comments,
      upvotes: 0,
      awards: 0,
    });
  }
  return posts;
}

function normalizeFacebookUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

export function dedupeFacebookPosts(posts: FacebookPost[]): FacebookPost[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: FacebookPost[] = [];
  for (const p of posts) {
    const urlKey = normalizeFacebookUrl(p.url);
    const titleKey = p.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (urlKey && seenUrl.has(urlKey)) continue;
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (urlKey) seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(p);
  }
  return out;
}
