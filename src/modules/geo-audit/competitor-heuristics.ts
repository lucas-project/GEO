import 'server-only';

import { config } from '@shared/config';
import { normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';

const DIRECTORY_HOST_RE =
  /wikipedia|facebook|linkedin|youtube|reddit|trustpilot|g2\.com|capterra|yelp|google\.|amazon\./i;

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./i, '');
  } catch {
    return url.replace(/^www\./i, '');
  }
}

function isCompetitorCandidate(link: string, ownHost: string): boolean {
  try {
    const host = hostnameFromUrl(link);
    if (!host || host === ownHost || host.endsWith(`.${ownHost}`)) return false;
    if (DIRECTORY_HOST_RE.test(host)) return false;
    return /^https?:\/\//i.test(link);
  } catch {
    return false;
  }
}

/** Serper web search fallback when LLM competitor generation fails. */
export async function serperCompetitorUrls(
  brandName: string,
  siteUrl: string,
): Promise<string[]> {
  const key = config.search?.serperApiKey;
  if (!key) return [];

  const host = hostnameFromUrl(siteUrl);
  const market = host.endsWith('.au') ? ' Australia' : '';
  const q = `"${brandName}" competitors${market} -site:${host}`;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 10 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      organic?: Array<{ link?: string }>;
    };

    const urls: string[] = [];
    for (const hit of data.organic ?? []) {
      const link = hit.link?.trim();
      if (!link || !isCompetitorCandidate(link, host)) continue;
      try {
        urls.push(normalizeWebsiteUrl(link));
      } catch {
        /* skip invalid */
      }
    }

    return [...new Set(urls)].slice(0, 5);
  } catch {
    return [];
  }
}

/** Static category seeds when search + LLM both unavailable. */
export function categoryCompetitorSeeds(
  siteUrl: string,
  siteKeywords: string[],
): string[] {
  const host = hostnameFromUrl(siteUrl);
  const blob = `${siteUrl} ${siteKeywords.join(' ')}`.toLowerCase();
  const isAu = host.endsWith('.au');
  const isHvac =
    /\b(hvac|air.?con|air.?condition|heat.?pump|split.?system|ducted|cooling|heating)\b/i.test(
      blob,
    );

  if (isAu && isHvac) {
    return [
      'https://www.daikin.com.au',
      'https://www.mitsubishielectric.com.au',
      'https://www.midea.com/au',
      'https://www.panasonic.com/au',
    ].filter((u) => !sameTargetSite(u, siteUrl));
  }

  if (isAu) {
    return [
      'https://www.productreview.com.au',
    ].filter((u) => !sameTargetSite(u, siteUrl));
  }

  return [];
}
