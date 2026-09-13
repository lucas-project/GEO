import * as cheerio from 'cheerio';
import type { PlatformId, PlatformProbeResult, RedditPost } from '../schemas';
import { detectCaptchaOrBlock } from './parse-helpers';
import type { ProbeContext } from './types';

const AU_FORUM_CONFIG: Record<
  Extract<PlatformId, 'whirlpool' | 'productreview' | 'ozbargain'>,
  { label: string; seedSearchUrl: (brand: string) => string }
> = {
  whirlpool: {
    label: 'Whirlpool Forums',
    seedSearchUrl: (brand) =>
      `https://forums.whirlpool.net.au/search/?q=${encodeURIComponent(brand)}`,
  },
  productreview: {
    label: 'ProductReview.com.au',
    seedSearchUrl: (brand) =>
      `https://www.productreview.com.au/listings/search?q=${encodeURIComponent(brand)}`,
  },
  ozbargain: {
    label: 'OzBargain',
    seedSearchUrl: (brand) =>
      `https://www.ozbargain.com.au/search/node/${encodeURIComponent(brand)}`,
  },
};

function parseForumThreads(html: string, baseUrl: string): RedditPost[] {
  const $ = cheerio.load(html);
  const posts: RedditPost[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    const href = $(el).attr('href');
    if (!title || title.length < 12 || !href) return;
    if (/^(login|sign up|register|home|search|menu|cookie)/i.test(title)) return;

    let url: string;
    try {
      url = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    const key = title.toLowerCase().slice(0, 72);
    if (seen.has(key)) return;
    seen.add(key);
    posts.push({ title, upvotes: 0, comments: 0, awards: 0, url });
    if (posts.length >= 12) return false;
  });

  return posts;
}

async function fetchForumPage(
  ctx: ProbeContext,
  url: string,
): Promise<{ html: string; finalUrl: string; fetchMethod?: string } | null> {
  try {
    const page = await ctx.fetchPage(url);
    if (page.statusCode >= 400) return null;
    if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) return null;
    return page;
  } catch {
    return null;
  }
}

export async function probeAuDiscussionSite(
  ctx: ProbeContext,
  platformId: Extract<PlatformId, 'whirlpool' | 'productreview' | 'ozbargain'>,
): Promise<PlatformProbeResult> {
  const config = AU_FORUM_CONFIG[platformId];
  const brand = ctx.brand.primaryBrand.trim();
  const supplementHits = ctx.searchSupplement?.byPlatform[platformId] ?? [];
  const urls = [
    ...supplementHits.map((h) => h.url),
    config.seedSearchUrl(brand),
  ];

  const allPosts: RedditPost[] = [];
  let pageUrl: string | undefined;
  let fetchMethod: string | undefined;

  for (const url of urls) {
    const page = await fetchForumPage(ctx, url);
    if (!page) continue;
    pageUrl = page.finalUrl;
    fetchMethod = page.fetchMethod ?? fetchMethod;
    allPosts.push(...parseForumThreads(page.html, page.finalUrl));
    if (allPosts.length >= 5) break;
  }

  const deduped = dedupePosts(allPosts);
  const hasHits = supplementHits.length > 0;

  return {
    platform: platformId,
    status:
      deduped.length > 0
        ? 'ok'
        : hasHits
          ? 'limited_data'
          : pageUrl
            ? 'limited_data'
            : 'unreachable',
    url: pageUrl ?? supplementHits[0]?.url ?? config.seedSearchUrl(brand),
    message:
      deduped.length > 0
        ? undefined
        : hasHits
          ? `Search found ${config.label} mentions — page parse limited`
          : undefined,
    signals: {
      profileExists: deduped.length > 0 || hasHits,
      postCount: deduped.length,
      searchHitEstimate: supplementHits.length || undefined,
    },
    posts: deduped,
    raw: fetchMethod ? { fetchMethod, searchEvidence: hasHits } : hasHits ? { searchEvidence: true } : undefined,
  };
}

function dedupePosts(posts: RedditPost[]): RedditPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const key = p.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const probeWhirlpool = (ctx: ProbeContext) => probeAuDiscussionSite(ctx, 'whirlpool');
export const probeProductReview = (ctx: ProbeContext) => probeAuDiscussionSite(ctx, 'productreview');
export const probeOzBargain = (ctx: ProbeContext) => probeAuDiscussionSite(ctx, 'ozbargain');
