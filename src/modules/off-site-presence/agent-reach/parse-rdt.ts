import type { SearchHit } from '../search-engine';

export interface RdtPostHit {
  title: string;
  url: string;
  subreddit?: string;
  upvotes?: number;
  comments?: number;
}

/** Parse rdt search --yaml / --json stdout into post hits. */
export function parseRdtSearchOutput(stdout: string): RdtPostHit[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseRdtJson(JSON.parse(trimmed) as unknown);
    } catch {
      /* yaml fallback */
    }
  }

  return parseRdtYamlLoose(stdout);
}

function parseRdtJson(data: unknown): RdtPostHit[] {
  const items: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { posts?: unknown }).posts)
      ? ((data as { posts: unknown[] }).posts ?? [])
      : data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
        ? ((data as { results: unknown[] }).results ?? [])
        : [];

  const out: RdtPostHit[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title : '';
    const permalink =
      (typeof row.permalink === 'string' && row.permalink) ||
      (typeof row.url === 'string' && row.url) ||
      '';
    const url = normalizeRedditUrl(permalink, row);
    if (!title || !url) continue;
    out.push({
      title,
      url,
      subreddit: typeof row.subreddit === 'string' ? row.subreddit : undefined,
      upvotes: typeof row.score === 'number' ? row.score : typeof row.upvotes === 'number' ? row.upvotes : undefined,
      comments:
        typeof row.num_comments === 'number'
          ? row.num_comments
          : typeof row.comments === 'number'
            ? row.comments
            : undefined,
    });
  }
  return dedupeRdt(out);
}

function normalizeRedditUrl(permalink: string, row: Record<string, unknown>): string | null {
  if (permalink.startsWith('http') && /reddit\.com/i.test(permalink)) return permalink;
  if (permalink.startsWith('/r/')) return `https://www.reddit.com${permalink}`;
  const id = typeof row.id === 'string' ? row.id : '';
  const sub = typeof row.subreddit === 'string' ? row.subreddit : '';
  if (id && sub) return `https://www.reddit.com/r/${sub}/comments/${id}/`;
  return null;
}

function parseRdtYamlLoose(stdout: string): RdtPostHit[] {
  const out: RdtPostHit[] = [];
  const blocks = stdout.split(/\n(?=- )|\n(?=title:)/i);
  for (const block of blocks) {
    const titleMatch = /title:\s*['"]?(.+?)['"]?\s*$/im.exec(block);
    const urlMatch =
      /(?:permalink|url):\s*['"]?(https?:\/\/[^\s'"]+|\/r\/[^\s'"]+)['"]?/im.exec(block) ??
      /(https?:\/\/[^\s]*reddit\.com\/r\/[^\s]+)/i.exec(block);
    const subMatch = /subreddit:\s*['"]?(\w+)['"]?/i.exec(block);
    const scoreMatch = /(?:score|upvotes):\s*(\d+)/i.exec(block);
    const commentsMatch = /(?:num_comments|comments):\s*(\d+)/i.exec(block);
    if (!titleMatch || !urlMatch) continue;
    const url = normalizeRedditUrl(urlMatch[1]!, {});
    if (!url) continue;
    out.push({
      title: titleMatch[1]!.trim(),
      url,
      subreddit: subMatch?.[1],
      upvotes: scoreMatch ? parseInt(scoreMatch[1]!, 10) : undefined,
      comments: commentsMatch ? parseInt(commentsMatch[1]!, 10) : undefined,
    });
  }
  return dedupeRdt(out);
}

function dedupeRdt(hits: RdtPostHit[]): RdtPostHit[] {
  const seen = new Set<string>();
  const out: RdtPostHit[] = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out;
}

export function rdtHitsToSearchHits(hits: RdtPostHit[]): SearchHit[] {
  return hits.map((h) => ({
    url: h.url,
    title: h.title,
    engine: 'rdt-cli' as const,
  }));
}
