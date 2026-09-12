import { describe, expect, it } from 'vitest';
import { mapInfluenceToOffSiteScore, buildOffSitePresenceReasons } from './map-to-scoring';
import type { OffSitePresenceReport } from './schemas';

function minimalReport(overrides: Partial<OffSitePresenceReport['scores']> = {}): OffSitePresenceReport {
  return {
    meta: {
      domain: 'acme.com',
      siteUrl: 'https://acme.com',
      scannedAt: new Date().toISOString(),
      durationMs: 1000,
      sources: ['playwright'],
      playwrightEnabled: true,
    },
    entity: {
      primaryBrand: 'Acme',
      aliases: ['Acme'],
      confidence: 0.9,
      needsReview: false,
      sources: ['og:site_name'],
      flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
      sameAsUrls: [],
    },
    platforms: {
      reddit: { platform: 'reddit', status: 'ok', signals: { profileExists: true } },
      quora: { platform: 'quora', status: 'limited_data', signals: {} },
      g2: { platform: 'g2', status: 'ok', signals: { profileExists: true } },
      capterra: { platform: 'capterra', status: 'unreachable', signals: {} },
      trustpilot: { platform: 'trustpilot', status: 'ok', signals: { profileExists: true } },
      site_search: { platform: 'site_search', status: 'ok', signals: { searchHitEstimate: 10 } },
    },
    engagement: {
      redditTopPosts: [],
      redditDisplayPosts: [],
      redditHighEngagementCount: 5,
      facebookDisplayPosts: [],
    } as any,
    scores: {
      total: 62,
      reviews: 28,
      community: 22,
      media: 12,
      band: 'qualified',
      ...overrides,
    },
    recommendations: [],
  };
}

describe('map-to-scoring', () => {
  it('uses influence total directly as 0-100', () => {
    expect(
      mapInfluenceToOffSiteScore({
        total: 100,
        reviews: 40,
        community: 35,
        media: 25,
        band: 'excellent',
      }),
    ).toBe(100);
    expect(
      mapInfluenceToOffSiteScore({
        total: 62,
        reviews: 20,
        community: 25,
        media: 17,
        band: 'qualified',
      }),
    ).toBe(62);
  });

  it('builds reasons from report', () => {
    const reasons = buildOffSitePresenceReasons(minimalReport());
    expect(reasons.some((r) => r.includes('Deep off-site scan'))).toBe(true);
    expect(reasons.some((r) => r.includes('/100'))).toBe(true);
    expect(reasons.some((r) => r.includes('Reddit'))).toBe(true);
  });
});
