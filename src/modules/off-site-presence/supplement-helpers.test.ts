import { describe, expect, it } from 'vitest';
import {
  classifyHits,
  filterOwnSiteHits,
  isOwnDomain,
  mergeSupplementHits,
  platformHitCap,
} from './supplement-helpers';
import type { SearchHit } from './search-engine';
import { mergeSearchSupplementIntoPlatforms } from './score';
import type { PlatformProbeResult } from './schemas';

describe('supplement-helpers', () => {
  it('filters own-domain hits', () => {
    const hits: SearchHit[] = [
      { url: 'https://www.ferrari.com/en-us', engine: 'bing' },
      { url: 'https://www.g2.com/products/ferrari', engine: 'bing' },
    ];
    const filtered = filterOwnSiteHits(hits, 'ferrari.com');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toContain('g2.com');
  });

  it('detects own subdomains', () => {
    expect(isOwnDomain('shop.ferrari.com', 'ferrari.com')).toBe(true);
    expect(isOwnDomain('www.g2.com', 'ferrari.com')).toBe(false);
  });

  it('classifies platform and social hits', () => {
    const hits: SearchHit[] = [
      { url: 'https://www.facebook.com/ferrari', engine: 'bing', title: 'Ferrari' },
      { url: 'https://www.g2.com/products/ferrari', engine: 'bing' },
    ];
    const { byPlatform, social, facebookPosts, crossPlatformPosts } = classifyHits(
      hits,
      'ferrari.com',
    );
    expect(byPlatform.g2?.[0]?.url).toContain('g2.com');
    expect(social.some((s) => s.platform === 'facebook')).toBe(true);
    expect(facebookPosts).toHaveLength(0);
    expect(crossPlatformPosts).toEqual({});
  });

  it('allows more than 3 reddit SERP hits', () => {
    expect(platformHitCap('reddit')).toBeGreaterThan(3);
    const hits: SearchHit[] = Array.from({ length: 8 }, (_, i) => ({
      url: `https://www.reddit.com/r/test/comments/abc${i}/thread`,
      engine: 'bing' as const,
      title: `Ferrari discussion ${i}`,
    }));
    const { byPlatform } = classifyHits(hits, 'ferrari.com');
    expect(byPlatform.reddit?.length).toBeGreaterThan(3);
  });

  it('keeps unmatched URLs in discovery bucket', () => {
    const hits: SearchHit[] = [
      { url: 'https://www.forbes.com/ferrari', engine: 'bing', title: 'Ferrari Forbes' },
    ];
    const { discovery } = classifyHits(hits, 'ferrari.com');
    expect(discovery).toHaveLength(1);
    expect(discovery[0]?.url).toContain('forbes.com');
  });

  it('merges supplement hits without duplicates', () => {
    const target: Partial<Record<'g2', SearchHit[]>> = {
      g2: [{ url: 'https://www.g2.com/a', engine: 'bing' }],
    };
    mergeSupplementHits(target, {
      g2: [
        { url: 'https://www.g2.com/a', engine: 'bing' },
        { url: 'https://www.g2.com/b', engine: 'bing' },
      ],
    });
    expect(target.g2).toHaveLength(2);
  });
});

describe('mergeSearchSupplementIntoPlatforms', () => {
  it('upgrades unreachable g2 when supplement has URL', () => {
    const platforms: Record<string, PlatformProbeResult> = {
      g2: { platform: 'g2', status: 'unreachable', signals: {} },
    };
    mergeSearchSupplementIntoPlatforms(platforms, {
      queries: [],
      byPlatform: {
        g2: [{ url: 'https://www.g2.com/products/ferrari', engine: 'bing', title: 'Ferrari' }],
      },
      social: [],
      facebookPosts: [],
      crossPlatformPosts: {},
      offSiteDomains: [],
      discoveryDomains: [],
      generalHitEstimate: 0,
      verticalHits: {},
      verticalDomains: [],
    });
    expect(platforms.g2?.status).toBe('limited_data');
    expect(platforms.g2?.url).toContain('g2.com');
    expect(platforms.g2?.signals.profileExists).toBe(true);
  });

  it('does not overwrite skipped platform status', () => {
    const platforms: Record<string, PlatformProbeResult> = {
      g2: {
        platform: 'g2',
        status: 'skipped',
        message: 'Not relevant for automotive brands',
        signals: {},
      },
    };
    mergeSearchSupplementIntoPlatforms(platforms, {
      queries: [],
      byPlatform: {
        g2: [{ url: 'https://www.g2.com/products/ferrari', engine: 'bing', title: 'Ferrari' }],
      },
      social: [],
      facebookPosts: [],
      crossPlatformPosts: {},
      offSiteDomains: [],
      discoveryDomains: [],
      generalHitEstimate: 0,
      verticalHits: {},
      verticalDomains: [],
    });
    expect(platforms.g2?.status).toBe('skipped');
  });
});
