import { describe, expect, it } from 'vitest';
import { buildPresenceInsights } from './insights';
import type { OffSitePresenceReport } from './schemas';

function ferrariReport(): OffSitePresenceReport {
  return {
    meta: {
      domain: 'ferrari.com',
      siteUrl: 'https://ferrari.com',
      scannedAt: new Date().toISOString(),
      durationMs: 120000,
      sources: ['playwright', 'search'],
      playwrightEnabled: true,
      searchPlan: {
        category: 'automotive',
        rationale: 'test',
        probePlatforms: ['reddit', 'quora', 'trustpilot', 'site_search'],
        searchTargets: ['reddit', 'general'],
        skipPlatforms: [
          { id: 'g2', reason: 'Not relevant for automotive' },
          { id: 'capterra', reason: 'Not relevant for automotive' },
        ],
        customQueries: [],
        additionalSources: [],
        brandKeywords: [],
        source: 'heuristic',
      },
    },
    entity: {
      primaryBrand: 'Ferrari',
      aliases: ['ferrari'],
      confidence: 0.95,
      needsReview: false,
      sources: ['override'],
      flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
      sameAsUrls: [],
    },
    platforms: {
      reddit: {
        platform: 'reddit',
        status: 'ok',
        signals: { profileExists: true, postCount: 10 },
        subreddits: ['ferrari'],
      },
      quora: { platform: 'quora', status: 'ok', signals: { profileExists: true } },
      g2: { platform: 'g2', status: 'skipped', signals: {}, message: 'Skipped' },
      capterra: { platform: 'capterra', status: 'skipped', signals: {}, message: 'Skipped' },
      trustpilot: {
        platform: 'trustpilot',
        status: 'limited_data',
        signals: { profileExists: true },
      },
      site_search: {
        platform: 'site_search',
        status: 'ok',
        signals: { searchHitEstimate: 12 },
      },
    },
    engagement: {
      redditTopPosts: [
        {
          title: 'Ferrari discussion',
          upvotes: 1000,
          comments: 50,
          awards: 0,
          url: 'https://reddit.com/r/ferrari/comments/x',
        },
      ],
      redditDisplayPosts: [],
      redditDisplayTarget: 10,
      redditDisplayShortfall: 0,
      facebookDisplayPosts: [],
      crossPlatformDisplayPosts: [],
      crossPlatformDisplayTarget: 10,
      crossPlatformDisplayShortfall: 0,
      redditHighEngagementCount: 2,
    },
    scores: {
      total: 58,
      reviews: 18,
      community: 25,
      media: 15,
      band: 'qualified',
    },
    recommendations: [],
    searchSupplement: {
      queryCount: 6,
      social: [{ platform: 'linkedin', url: 'https://linkedin.com/company/ferrari', title: 'Ferrari' }],
      offSiteDomains: ['reddit.com', 'motortrend.com'],
    },
  };
}

describe('buildPresenceInsights', () => {
  it('produces headline, verdict, strengths, gaps, and getting started', () => {
    const insights = buildPresenceInsights(ferrariReport());
    expect(insights.headline.length).toBeGreaterThan(5);
    expect(insights.verdict).toContain('Ferrari');
    expect(insights.strengths.length).toBeGreaterThan(0);
    expect(insights.gettingStarted.length).toBe(3);
    expect(insights.dimensions.reviews.max).toBe(40);
    expect(insights.dimensions.community.max).toBe(35);
    expect(insights.dimensions.media.max).toBe(25);
    expect(insights.discoveries.redditSubreddits).toContain('ferrari');
  });
});
