import { config } from '@shared/config';
import type { RedditPost } from '../schemas';

interface RedditListingChild {
  data?: {
    title?: string;
    score?: number;
    num_comments?: number;
    subreddit?: string;
    permalink?: string;
    created_utc?: number;
    url?: string;
    is_self?: boolean;
  };
}

interface RedditListingResponse {
  data?: {
    children?: RedditListingChild[];
    subscribers?: number;
    public_description?: string;
    display_name?: string;
  };
}

const JSON_HEADERS = {
  'User-Agent': config.crawl.browserUserAgent,
  Accept: 'application/json',
};

async function fetchRedditJson(url: string): Promise<RedditListingResponse | null> {
  try {
    const res = await fetch(url, {
      headers: JSON_HEADERS,
      signal: AbortSignal.timeout(config.presenceProbe.timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as RedditListingResponse;
  } catch {
    return null;
  }
}

export function parseRedditSearchJson(body: RedditListingResponse): RedditPost[] {
  const posts: RedditPost[] = [];
  for (const child of body.data?.children ?? []) {
    const d = child.data;
    if (!d?.title || d.title.length < 5) continue;
    const external =
      d.url && !d.is_self && !/reddit\.com/i.test(d.url) ? d.url : undefined;
    posts.push({
      title: d.title,
      subreddit: d.subreddit,
      upvotes: d.score ?? 0,
      comments: d.num_comments ?? 0,
      awards: 0,
      url: external ?? (d.permalink ? `https://www.reddit.com${d.permalink}` : undefined),
      publishedAt: d.created_utc
        ? new Date(d.created_utc * 1000).toISOString()
        : undefined,
    });
  }
  return posts;
}

export async function fetchRedditSubredditJson(
  slug: string,
): Promise<{ exists: boolean; subscribers: number } | null> {
  const body = await fetchRedditJson(`https://www.reddit.com/r/${slug}/about.json`);
  if (!body?.data) return null;

  const subscribers = body.data.subscribers ?? 0;
  const displayName = body.data.display_name?.toLowerCase();
  if (displayName && displayName !== slug.toLowerCase()) {
    return { exists: false, subscribers: 0 };
  }

  return { exists: true, subscribers };
}

export async function fetchRedditSearchPosts(brand: string): Promise<RedditPost[]> {
  const q = encodeURIComponent(brand);
  const body = await fetchRedditJson(
    `https://www.reddit.com/search.json?q=${q}&sort=top&t=year&limit=40&type=link`,
  );
  if (!body) return [];
  return parseRedditSearchJson(body);
}
