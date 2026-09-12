import type { CrossPlatformPost } from './schemas';
import type { SearchHit } from './search-engine';

export const CROSS_PLATFORM_PRESENCE_PLATFORMS = [
  'xiaohongshu',
  'zhihu',
  'tiktok',
  'amazon',
  'x',
] as const;

export type CrossPlatformPresencePlatform = (typeof CROSS_PLATFORM_PRESENCE_PLATFORMS)[number];

export function isXPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('x.com') && !host.includes('twitter.com')) return false;
    return /\/status\/\d+/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isTiktokPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, '').includes('tiktok.com')) return false;
    return /\/video\/\d+/i.test(u.pathname) || /@/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isXiaohongshuNoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, '').includes('xiaohongshu.com')) return false;
    if (/^\/explore\/?$/i.test(u.pathname)) return false;
    return /\/explore\/|\/discovery\/item\/|\/user\/profile\//i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isZhihuDiscussionUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, '').includes('zhihu.com')) return false;
    return /\/question\/|\/answer\/|\/p\//i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isAmazonReviewUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('amazon.')) return false;
    return (
      /\/product-reviews\//i.test(u.pathname) ||
      /\/review\//i.test(u.pathname) ||
      /\/dp\/[A-Z0-9]{8,}/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function isCrossPlatformPostUrl(url: string): boolean {
  return (
    isXPostUrl(url) ||
    isTiktokPostUrl(url) ||
    isXiaohongshuNoteUrl(url) ||
    isZhihuDiscussionUrl(url) ||
    isAmazonReviewUrl(url)
  );
}

function titleFromSearchHit(
  hit: SearchHit,
  platform: CrossPlatformPresencePlatform,
): string | null {
  const title = hit.title?.trim();
  if (title && title.length >= 3) return title;
  const snippet = hit.snippet?.trim();
  if (snippet && snippet.length >= 8) return snippet.slice(0, 200);
  try {
    const host = new URL(hit.url).hostname.replace(/^www\./, '');
    return `Discussion on ${host}`;
  } catch {
    return `Discussion on ${platform}`;
  }
}

export function crossPlatformHitsToPosts(
  hitsByPlatform: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>,
): CrossPlatformPost[] {
  const posts: CrossPlatformPost[] = [];
  for (const platform of CROSS_PLATFORM_PRESENCE_PLATFORMS) {
    for (const hit of hitsByPlatform[platform] ?? []) {
      const resolvedTitle = titleFromSearchHit(hit, platform);
      if (!resolvedTitle) continue;
      if (!isCrossPlatformPostUrl(hit.url)) continue;
      posts.push({
        platform,
        title: resolvedTitle,
        url: hit.url,
        upvotes: 0,
        comments: 0,
        likes: 0,
        awards: 0,
      });
    }
  }
  return dedupeCrossPlatformPosts(posts);
}

export function dedupeCrossPlatformPosts(posts: CrossPlatformPost[]): CrossPlatformPost[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: CrossPlatformPost[] = [];
  for (const p of posts) {
    const urlKey = p.url.toLowerCase();
    const titleKey = p.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    if (seenUrl.has(urlKey)) continue;
    if (seenTitle.has(titleKey)) continue;
    seenUrl.add(urlKey);
    seenTitle.add(titleKey);
    out.push(p);
  }
  return out;
}
