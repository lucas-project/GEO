import { config } from '@shared/config';
import { allowsCapability } from '@shared/ai';
import { currentTaskBudget } from '@shared/ai/budget';
import { matchPlatformUrl } from '@modules/brand-presence';
import type { PresencePlatform } from '@modules/brand-presence';

export interface SerperBoostResult {
  redditMentionEstimate: number | null;
  mediaMentions: number;
  primarySourceDomains: string[];
  verifiedPlatforms: PresencePlatform[];
  searchQueries: { query: string; resultCount: number }[];
}

const AUTHORITY_MEDIA = [
  'techcrunch.com',
  'forbes.com',
  'wired.com',
  'theverge.com',
  'reuters.com',
  'bloomberg.com',
];

const TOP_HITS = 5;

async function serperSearch(query: string): Promise<Array<{ link: string; snippet: string }>> {
  const key = config.search?.serperApiKey;
  if (!key) return [];
  if (!allowsCapability('remote_search')) return [];
  currentTaskBudget()?.consume('searchRequests');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { organic?: Array<{ link?: string; snippet?: string }> };
  return (data.organic ?? [])
    .map((o) => ({ link: o.link ?? '', snippet: o.snippet ?? '' }))
    .filter((h) => h.link)
    .slice(0, TOP_HITS);
}

function domainFromUrl(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl.replace(/^www\./, '');
  }
}

export async function runSerperBoost(input: {
  brandName: string;
  siteUrl: string;
}): Promise<SerperBoostResult | null> {
  if (!config.search?.serperApiKey) return null;

  const domain = domainFromUrl(input.siteUrl);
  const brand = input.brandName;

  const queryDefs = [
    { key: 'reddit', q: `site:reddit.com "${brand}"` },
    { key: 'g2', q: `site:g2.com "${brand}"` },
    { key: 'trustpilot', q: `site:trustpilot.com "${domain}"` },
    { key: 'news', q: `"${brand}"` },
  ];

  const results = await Promise.all(
    queryDefs.map(async (def) => {
      const hits = await serperSearch(def.q);
      return { ...def, hits };
    }),
  );

  const reddit = results.find((r) => r.key === 'reddit')?.hits ?? [];
  const news = results.find((r) => r.key === 'news')?.hits ?? [];
  const allHits = results.flatMap((r) => r.hits);

  const verifiedSet = new Set<PresencePlatform>();
  for (const h of allHits) {
    const match = matchPlatformUrl(h.link);
    if (match) verifiedSet.add(match.platform);
  }

  const mediaMentions = news.filter((r) =>
    AUTHORITY_MEDIA.some((d) => r.link.includes(d)),
  ).length;

  const primarySourceDomains = news
    .map((r) => {
      try {
        return new URL(r.link).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    redditMentionEstimate: reddit.length || null,
    mediaMentions,
    primarySourceDomains,
    verifiedPlatforms: [...verifiedSet],
    searchQueries: results.map((r) => ({ query: r.q, resultCount: r.hits.length })),
  };
}
