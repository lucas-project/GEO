import { matchPlatformUrl } from '@modules/brand-presence';
import type { PresencePlatform } from '@modules/brand-presence';
import type { PlatformId } from './schemas';
import type { SearchHit } from './search-engine';
import { isFacebookPostUrl, isFacebookProfileUrl } from './facebook-posts';
import {
  CROSS_PLATFORM_PRESENCE_PLATFORMS,
  isCrossPlatformPostUrl,
  type CrossPlatformPresencePlatform,
} from './cross-platform-posts';

export interface SearchSupplementSocialHit {
  platform: PresencePlatform;
  url: string;
  title?: string;
}

const PROBED_PLATFORM_IDS = new Set<PlatformId>([
  'reddit',
  'quora',
  'g2',
  'capterra',
  'trustpilot',
  'whirlpool',
  'productreview',
  'ozbargain',
]);

export function isOwnDomain(hostname: string, targetDomain: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  const domain = targetDomain.replace(/^www\./, '').toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

export function filterOwnSiteHits(hits: SearchHit[], targetDomain: string): SearchHit[] {
  return hits.filter((h) => {
    try {
      return !isOwnDomain(new URL(h.url).hostname, targetDomain);
    } catch {
      return false;
    }
  });
}

export function bestSupplementUrl(
  supplement: { byPlatform: Partial<Record<PlatformId, SearchHit[]>> } | undefined,
  platformId: PlatformId,
): string | undefined {
  const hits = supplement?.byPlatform[platformId];
  if (!hits?.length) return undefined;
  return hits[0]?.url;
}

const DEFAULT_PLATFORM_HIT_CAP = 8;
const REDDIT_PLATFORM_HIT_CAP = 15;
const CROSS_PLATFORM_HIT_CAP = 12;

export function platformHitCap(platformId: PlatformId | string): number {
  if (platformId === 'reddit') return REDDIT_PLATFORM_HIT_CAP;
  if (CROSS_PLATFORM_PRESENCE_PLATFORMS.includes(platformId as CrossPlatformPresencePlatform)) {
    return CROSS_PLATFORM_HIT_CAP;
  }
  return DEFAULT_PLATFORM_HIT_CAP;
}

export function classifyHits(
  hits: SearchHit[],
  targetDomain: string,
): {
  byPlatform: Partial<Record<PlatformId, SearchHit[]>>;
  social: SearchSupplementSocialHit[];
  facebookPosts: SearchHit[];
  crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>;
  discovery: SearchHit[];
} {
  const byPlatform: Partial<Record<PlatformId, SearchHit[]>> = {};
  const social: SearchSupplementSocialHit[] = [];
  const facebookPosts: SearchHit[] = [];
  const crossPlatformPosts: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>> = {};
  const discovery: SearchHit[] = [];
  const seenSocial = new Set<string>();
  const seenFacebookPost = new Set<string>();
  const seenCrossPlatform = new Set<string>();
  const seenDiscovery = new Set<string>();

  for (const hit of filterOwnSiteHits(hits, targetDomain)) {
    const match = matchPlatformUrl(hit.url);
    if (!match) {
      if (!seenDiscovery.has(hit.url)) {
        seenDiscovery.add(hit.url);
        discovery.push(hit);
      }
      continue;
    }

    if (PROBED_PLATFORM_IDS.has(match.platform as PlatformId)) {
      const key = match.platform as PlatformId;
      if (!byPlatform[key]) byPlatform[key] = [];
      const cap = platformHitCap(key);
      if (byPlatform[key]!.length < cap) {
        byPlatform[key]!.push({ ...hit, url: match.url });
      }
      continue;
    }

    if (match.platform === 'facebook') {
      if (isFacebookPostUrl(match.url)) {
        if (!seenFacebookPost.has(match.url)) {
          seenFacebookPost.add(match.url);
          facebookPosts.push({ ...hit, url: match.url });
        }
        continue;
      }
      if (!isFacebookProfileUrl(match.url)) continue;
    }

    const crossKey = match.platform as CrossPlatformPresencePlatform;
    if (CROSS_PLATFORM_PRESENCE_PLATFORMS.includes(crossKey) && isCrossPlatformPostUrl(match.url)) {
      const cap = platformHitCap(crossKey);
      if (!crossPlatformPosts[crossKey]) crossPlatformPosts[crossKey] = [];
      const dedupe = `${crossKey}:${match.url}`;
      if (!seenCrossPlatform.has(dedupe) && crossPlatformPosts[crossKey]!.length < cap) {
        seenCrossPlatform.add(dedupe);
        crossPlatformPosts[crossKey]!.push({ ...hit, url: match.url });
      }
      continue;
    }

    const socialKey = `${match.platform}:${match.url}`;
    if (seenSocial.has(socialKey)) continue;
    seenSocial.add(socialKey);
    social.push({
      platform: match.platform as PresencePlatform,
      url: match.url,
      title: hit.title,
    });
  }

  return { byPlatform, social, facebookPosts, crossPlatformPosts, discovery };
}

export function mergeSupplementHits(
  target: Partial<Record<PlatformId, SearchHit[]>>,
  incoming: Partial<Record<PlatformId, SearchHit[]>>,
): void {
  for (const [id, hits] of Object.entries(incoming) as [PlatformId, SearchHit[]][]) {
    if (!hits?.length) continue;
    const existing = target[id] ?? [];
    const seen = new Set(existing.map((h) => h.url));
    for (const h of hits) {
      if (!seen.has(h.url)) {
        existing.push(h);
        seen.add(h.url);
      }
    }
    target[id] = existing.slice(0, platformHitCap(id));
  }
}

export function mergeCrossPlatformHits(
  target: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>,
  incoming: Partial<Record<CrossPlatformPresencePlatform, SearchHit[]>>,
): void {
  for (const [id, hits] of Object.entries(incoming) as [
    CrossPlatformPresencePlatform,
    SearchHit[],
  ][]) {
    if (!hits?.length) continue;
    const existing = target[id] ?? [];
    const seen = new Set(existing.map((h) => h.url));
    for (const h of hits) {
      if (!seen.has(h.url)) {
        existing.push(h);
        seen.add(h.url);
      }
    }
    target[id] = existing.slice(0, platformHitCap(id));
  }
}
