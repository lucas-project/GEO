import { config } from '@shared/config';
import { toSearchBrandLabel } from './search-brand';

const REVIEW_SOCIAL_HOST_RE =
  /(?:^|\.)((?:g2|capterra|trustpilot|reddit|quora|facebook|linkedin|instagram|youtube|twitter|x)\.com)/i;

export function isDiscoveryMediaHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  if (REVIEW_SOCIAL_HOST_RE.test(host)) return false;
  if (host === 'wikipedia.org' || host.endsWith('.wikipedia.org')) return false;
  return host.length >= 4 && host.includes('.');
}

export function hostnamesFromUrls(urls: string[]): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (isDiscoveryMediaHost(host)) out.add(host);
    } catch {
      /* skip */
    }
  }
  return [...out];
}

export interface WikipediaNotabilitySignal {
  present: boolean;
  url?: string;
  title?: string;
}

/** Free notability check — no API key (Wikipedia REST). */
export async function fetchWikipediaNotability(brand: string): Promise<WikipediaNotabilitySignal> {
  const title = encodeURIComponent(toSearchBrandLabel(brand).replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': config.crawl.browserUserAgent },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { present: false };
    const data = (await res.json()) as { title?: string; content_urls?: { desktop?: { page?: string } } };
    const page = data.content_urls?.desktop?.page;
    return {
      present: true,
      url: page,
      title: data.title,
    };
  } catch {
    return { present: false };
  }
}
