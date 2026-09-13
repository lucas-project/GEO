import * as cheerio from 'cheerio';
import { slugifyBrand } from '../aliases';
import type { PlatformProbeResult, RedditPost } from '../schemas';
import {
  detectCaptchaOrBlock,
  firstMatchingText,
  parseCount,
} from './parse-helpers';
import {
  fetchRedditSearchPosts,
  fetchRedditSubredditJson,
} from './reddit-json';
import { bestSupplementUrl } from '../supplement-helpers';
import { sanitizeParsedCommunities, isNoiseSubreddit } from '../reddit-communities';
import { buildRedditPostSearchQueries } from '../reddit-search-queries';
import { inferMarketFromDomain } from '../market-country';
import type { FetchPageOptions, ProbeContext } from './types';

const REDDIT_FETCH: FetchPageOptions = { blockHeavyResources: false };

function parseRedditPosts(html: string): RedditPost[] {
  const $ = cheerio.load(html);
  const posts: RedditPost[] = [];

  const selectors = [
    '[data-testid="post-container"]',
    'article[data-testid="post-container"]',
    '.Post',
    'shreddit-post',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const node = $(el);
      const title =
        node.find('[data-testid="post-title"]').text().trim() ||
        node.find('a[data-click-id="body"]').text().trim() ||
        node.find('h3').first().text().trim();
      if (!title || title.length < 5) return;

      const scoreText =
        node.find('[data-testid="vote-arrows"]').parent().text() ||
        node.find('.score').text() ||
        '';
      const commentsText =
        node.find('a[href*="/comments/"]').text() ||
        node.find('[data-click-id="comments"]').text() ||
        '';

      posts.push({
        title,
        subreddit: extractSubreddit(node.find('a[href*="/r/"]').attr('href') ?? ''),
        upvotes: parseCount(scoreText) || parseCount(node.attr('score') ?? ''),
        comments: parseCount(commentsText),
        awards: 0,
        url: node.find('a[data-click-id="body"]').attr('href') ?? undefined,
      });
    });
    if (posts.length > 0) break;
  }

  return posts;
}

function extractSubreddit(href: string): string | undefined {
  const m = /\/r\/([^/]+)/i.exec(href);
  return m?.[1];
}

function parseSubredditMeta(html: string): { exists: boolean; subscribers: number } {
  const $ = cheerio.load(html);
  const title = $('title').text();
  if (/banned|private|not found/i.test(title)) {
    return { exists: false, subscribers: 0 };
  }
  const memberText = firstMatchingText($, [
    '#sidebar .subscribers',
    '[data-testid="subreddit-subscribers"]',
    '.subscribers',
    'faceplate-number',
  ]);
  return { exists: true, subscribers: parseCount(memberText ?? undefined) };
}

function parseCommunities(html: string): string[] {
  const $ = cheerio.load(html);
  const names = new Set<string>();
  $('a[href*="/r/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = /\/r\/([^/?#]+)/i.exec(href);
    if (m?.[1] && m[1].length >= 2) names.add(m[1]);
  });
  return sanitizeParsedCommunities([...names]);
}

function brandSearchVariants(brand: string): string[] {
  const trimmed = brand.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  if (/\s/.test(trimmed)) {
    variants.add(trimmed.replace(/\s+/g, ''));
    variants.add(trimmed.replace(/\s+/g, '+'));
  }
  return [...variants];
}

function subredditPaths(slug: string): string[] {
  return [`https://www.reddit.com/r/${slug}`, `https://i.reddit.com/r/${slug}`];
}

function postSearchPaths(query: string): string[] {
  const q = encodeURIComponent(query);
  return [
    `https://www.reddit.com/search/?q=${q}&type=posts&sort=top&t=year`,
    `https://i.reddit.com/search?q=${q}&sort=top&t=year`,
  ];
}

async function fetchWithFallback(
  ctx: ProbeContext,
  paths: string[],
): Promise<{ html: string; statusCode: number; finalUrl: string; fetchMethod?: string } | null> {
  for (const path of paths) {
    try {
      const page = await ctx.fetchPage(path, REDDIT_FETCH);
      if (page.statusCode >= 400) continue;
      if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) continue;
      return page;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function probeRedditViaJson(
  slug: string,
  postQueries: string[],
): Promise<{
  allPosts: RedditPost[];
  subreddits: Set<string>;
  profileExists: boolean;
  subscriberCount: number;
  fetchMethod?: string;
}> {
  const allPosts: RedditPost[] = [];
  const subreddits = new Set<string>();
  let profileExists = false;
  let subscriberCount = 0;
  let fetchMethod: string | undefined;

  const jsonMeta = await fetchRedditSubredditJson(slug);
  if (jsonMeta?.exists) {
    profileExists = true;
    subscriberCount = jsonMeta.subscribers;
    subreddits.add(slug);
    fetchMethod = 'reddit-json';
  }

  for (const query of postQueries) {
    const jsonPosts = await fetchRedditSearchPosts(query);
    if (jsonPosts.length > 0) {
      allPosts.push(...jsonPosts);
      for (const p of jsonPosts) {
        if (p.subreddit && !isNoiseSubreddit(p.subreddit)) subreddits.add(p.subreddit);
      }
      fetchMethod = 'reddit-json';
    }
  }

  return { allPosts, subreddits, profileExists, subscriberCount, fetchMethod };
}

function redditHasEnoughData(
  posts: RedditPost[],
  profileExists: boolean,
  subredditCount: number,
): boolean {
  return posts.length >= 3 || profileExists || subredditCount >= 2;
}

export async function probeReddit(ctx: ProbeContext): Promise<PlatformProbeResult> {
  const slug = slugifyBrand(ctx.brand.primaryBrand);
  const aliases = ctx.brand.aliases.slice(0, 2);
  const market = inferMarketFromDomain(ctx.domain);
  const isAu = market?.code === 'AU';

  const planKeywords = (ctx.searchPlan?.brandKeywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 4);
  const { postQueries, communityQueries } = buildRedditPostSearchQueries({
    brand: ctx.brand.primaryBrand,
    aliases: aliases.flatMap((a) => brandSearchVariants(a)),
    planKeywords,
    marketCountry: market,
  });

  const jsonProbe = await probeRedditViaJson(slug, postQueries);
  const allPosts = [...jsonProbe.allPosts];
  const subreddits = new Set(jsonProbe.subreddits);
  let profileExists = jsonProbe.profileExists;
  let subscriberCount = jsonProbe.subscriberCount;
  let fetchMethod = jsonProbe.fetchMethod;
  let subPage: Awaited<ReturnType<typeof fetchWithFallback>> = null;

  const skipPlaywright =
    redditHasEnoughData(allPosts, profileExists, subreddits.size) ||
    (isAu && allPosts.length === 0 && !profileExists);

  if (!skipPlaywright) {
    subPage = await fetchWithFallback(ctx, subredditPaths(slug));
    if (subPage) {
      fetchMethod = subPage.fetchMethod ?? fetchMethod;
      const meta = parseSubredditMeta(subPage.html);
      profileExists = profileExists || meta.exists;
      subscriberCount = subscriberCount || meta.subscribers;
      if (meta.exists) subreddits.add(slug);
    }

    for (const query of postQueries) {
      const searchPage = await fetchWithFallback(ctx, postSearchPaths(query));
      if (searchPage) {
        fetchMethod = searchPage.fetchMethod ?? fetchMethod;
        const posts = parseRedditPosts(searchPage.html);
        allPosts.push(...posts);
        for (const p of posts) {
          if (p.subreddit && !isNoiseSubreddit(p.subreddit)) subreddits.add(p.subreddit);
        }
      }
    }

    for (const query of communityQueries) {
      const q = encodeURIComponent(query);
      const communitiesPage = await fetchWithFallback(ctx, [
        `https://www.reddit.com/search/?q=${q}&type=communities`,
      ]);
      if (communitiesPage) {
        for (const name of parseCommunities(communitiesPage.html)) {
          subreddits.add(name);
        }
      }
    }
  }

  let deduped = dedupePosts(allPosts);
  let status: PlatformProbeResult['status'] =
    deduped.length > 0 || profileExists || subreddits.size > 0
      ? 'ok'
      : subPage
        ? 'limited_data'
        : 'unreachable';

  if (status === 'unreachable' || deduped.length === 0) {
    const supplementUrl = bestSupplementUrl(ctx.searchSupplement ?? undefined, 'reddit');
    if (supplementUrl) {
      const supPage = await fetchWithFallback(ctx, [supplementUrl]);
      if (supPage) {
        fetchMethod = supPage.fetchMethod ?? fetchMethod;
        const posts = parseRedditPosts(supPage.html);
        allPosts.push(...posts);
        for (const p of posts) {
          if (p.subreddit && !isNoiseSubreddit(p.subreddit)) subreddits.add(p.subreddit);
        }
        const subMatch = /\/r\/([^/?#]+)/i.exec(supplementUrl);
        if (subMatch?.[1] && !isNoiseSubreddit(subMatch[1])) subreddits.add(subMatch[1]);
        if (posts.length > 0 || /reddit\.com\/r\//i.test(supplementUrl)) {
          profileExists = true;
          status = posts.length > 0 ? 'ok' : 'limited_data';
        }
      }
    }
  }

  deduped = dedupePosts(allPosts);
  const finalStatus: PlatformProbeResult['status'] =
    deduped.length > 0 || profileExists || subreddits.size > 0
      ? 'ok'
      : subPage
        ? 'limited_data'
        : isAu
          ? 'limited_data'
          : 'unreachable';

  return {
    platform: 'reddit',
    status: finalStatus,
    url: subPage?.finalUrl ?? `https://www.reddit.com/r/${slug}`,
    message:
      isAu && finalStatus !== 'ok' && deduped.length === 0
        ? 'Reddit blocked or empty — Australian forums (Whirlpool, ProductReview, OzBargain) checked instead'
        : undefined,
    signals: {
      profileExists,
      subscriberCount,
      postCount: deduped.length,
      highEngagementPostCount: deduped.filter((p) => p.upvotes > 10 && p.comments > 5).length,
    },
    posts: deduped,
    subreddits: [...subreddits],
    raw: fetchMethod ? { fetchMethod, skippedPlaywright: skipPlaywright } : undefined,
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
