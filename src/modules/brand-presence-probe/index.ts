/**
 * Optional search-backed brand presence probes (v2).
 * Uses Serper when SERPER_API_KEY is set; otherwise returns crawl-only hints.
 */

import { config } from '@shared/config';
import { matchPlatformUrl } from '@modules/brand-presence/platforms';
import type { PresencePlatform } from '@modules/brand-presence';
import type { PresenceSignals } from '@modules/brand-presence';

export interface PresenceSearchHit {
  link: string;
  snippet: string;
}

export interface PresenceSearchQueryResult {
  query: string;
  resultCount: number;
  topHits: PresenceSearchHit[];
}

export interface PresenceProbeResult {
  source: 'crawl-only' | 'serper' | 'tavily';
  brandName: string;
  siteDomain: string;
  redditMentionEstimate: number | null;
  reviewProfilesFound: string[];
  mediaMentions: number;
  primarySourceDomains: string[];
  brandDescriptionSnippet: string | null;
  verifiedPlatforms: PresencePlatform[];
  searchQueries: PresenceSearchQueryResult[];
}

const TOP_HITS = 5;

async function serperSearch(query: string): Promise<PresenceSearchHit[]> {
  const key = config.search?.serperApiKey;
  if (!key) return [];
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { organic?: Array<{ link?: string; snippet?: string }> };
  return (data.organic ?? [])
    .map((o) => ({
      link: o.link ?? '',
      snippet: o.snippet ?? '',
    }))
    .filter((h) => h.link)
    .slice(0, TOP_HITS);
}

const AUTHORITY_MEDIA = [
  'techcrunch.com',
  'forbes.com',
  'wired.com',
  'theverge.com',
  'reuters.com',
  'bloomberg.com',
];

function domainFromUrl(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}

export async function runPresenceProbe(input: {
  brandName: string;
  siteUrl: string;
  presenceSignals: PresenceSignals;
}): Promise<PresenceProbeResult> {
  const domain = domainFromUrl(input.siteUrl);
  const brand = input.brandName;
  const linkedReviews = ['g2', 'capterra', 'trustpilot'].filter(
    (p) => input.presenceSignals.platforms[p as keyof typeof input.presenceSignals.platforms]?.linked,
  );

  const emptyProbe: PresenceProbeResult = {
    source: 'crawl-only',
    brandName: brand,
    siteDomain: domain,
    redditMentionEstimate: null,
    reviewProfilesFound: linkedReviews,
    mediaMentions: 0,
    primarySourceDomains: [],
    brandDescriptionSnippet: null,
    verifiedPlatforms: [],
    searchQueries: [],
  };

  if (!config.search?.serperApiKey) {
    return emptyProbe;
  }

  const isAu = domain.endsWith('.au');
  const queryDefs: { key: string; q: string }[] = isAu
    ? [
        { key: 'whirlpool', q: `site:forums.whirlpool.net.au "${brand}"` },
        { key: 'productreview', q: `site:productreview.com.au "${brand}"` },
        { key: 'ozbargain', q: `site:ozbargain.com.au "${brand}"` },
        { key: 'trustpilot', q: `site:trustpilot.com "${domain}"` },
        { key: 'reddit', q: `site:reddit.com "${brand}" Australia` },
        { key: 'news', q: `"${brand}" Australia` },
      ]
    : [
        { key: 'reddit', q: `site:reddit.com "${brand}"` },
        { key: 'g2', q: `site:g2.com "${brand}"` },
        { key: 'trustpilot', q: `site:trustpilot.com "${domain}"` },
        { key: 'linkedin', q: `site:linkedin.com/company "${brand}"` },
        { key: 'news', q: `"${brand}"` },
      ];

  const results = await Promise.all(
    queryDefs.map(async (def) => {
      const hits = await serperSearch(def.q);
      return { ...def, hits };
    }),
  );

  const searchQueries: PresenceSearchQueryResult[] = results.map((r) => ({
    query: r.q,
    resultCount: r.hits.length,
    topHits: r.hits,
  }));

  const reddit = results.find((r) => r.key === 'reddit')?.hits ?? [];
  const g2 = results.find((r) => r.key === 'g2')?.hits ?? [];
  const trustpilot = results.find((r) => r.key === 'trustpilot')?.hits ?? [];
  const linkedin = results.find((r) => r.key === 'linkedin')?.hits ?? [];
  const news = results.find((r) => r.key === 'news')?.hits ?? [];
  const auCommunity = isAu
    ? [
        ...(results.find((r) => r.key === 'whirlpool')?.hits ?? []),
        ...(results.find((r) => r.key === 'productreview')?.hits ?? []),
        ...(results.find((r) => r.key === 'ozbargain')?.hits ?? []),
      ]
    : [];

  const allResults = [...reddit, ...g2, ...trustpilot, ...linkedin, ...news, ...auCommunity];
  const verifiedSet = new Set<PresencePlatform>();

  for (const r of allResults) {
    const match = matchPlatformUrl(r.link);
    if (match) verifiedSet.add(match.platform);
  }

  const redditMentionEstimate = isAu ? auCommunity.length + reddit.length : reddit.length;
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

  const reviewProfilesFound = [
    ...linkedReviews,
    ...allResults
      .map((r) => r.link)
      .filter((l) => /g2\.com|capterra|trustpilot/i.test(l)),
  ];

  return {
    source: 'serper',
    brandName: brand,
    siteDomain: domain,
    redditMentionEstimate,
    reviewProfilesFound: [...new Set(reviewProfilesFound)],
    mediaMentions,
    primarySourceDomains,
    brandDescriptionSnippet: news[0]?.snippet ?? null,
    verifiedPlatforms: [...verifiedSet],
    searchQueries,
  };
}
