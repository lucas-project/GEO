import { describe, expect, it } from 'vitest';
import {
  computeInfluenceScores,
  scoreD3,
  scoreD4,
  scoreD4SupplementBonus,
} from './score';
import type { PlatformProbeResult } from './schemas';

function emptyPlatforms(): Record<string, PlatformProbeResult> {
  return {
    reddit: { platform: 'reddit', status: 'unreachable', signals: {} },
    quora: { platform: 'quora', status: 'unreachable', signals: {} },
    g2: { platform: 'g2', status: 'unreachable', signals: {} },
    capterra: { platform: 'capterra', status: 'unreachable', signals: {} },
    trustpilot: { platform: 'trustpilot', status: 'unreachable', signals: {} },
    site_search: { platform: 'site_search', status: 'unreachable', signals: {} },
  };
}

describe('influence scores', () => {
  it('scores review platforms in D3', () => {
    const platforms = emptyPlatforms();
    platforms.g2 = {
      platform: 'g2',
      status: 'ok',
      signals: { profileExists: true, reviewCount: 10 },
    };
    platforms.trustpilot = {
      platform: 'trustpilot',
      status: 'ok',
      signals: { profileExists: true, reviewCount: 50, rating: 4.2 },
    };
    expect(scoreD3(platforms)).toBeGreaterThanOrEqual(18);
  });

  it('tiers Reddit engagement in D4', () => {
    const platforms = emptyPlatforms();
    expect(scoreD4(platforms, 0)).toBe(0);
    expect(scoreD4(platforms, 5)).toBe(6);
    expect(scoreD4(platforms, 12)).toBe(10);
  });

  it('ignores skipped review platforms in D3', () => {
    const platforms = emptyPlatforms();
    platforms.g2 = {
      platform: 'g2',
      status: 'skipped',
      message: 'Not relevant',
      signals: {},
    };
    platforms.capterra = {
      platform: 'capterra',
      status: 'skipped',
      message: 'Not relevant',
      signals: {},
    };
    platforms.trustpilot = {
      platform: 'trustpilot',
      status: 'ok',
      signals: { profileExists: true, reviewCount: 20 },
    };
    platforms.site_search = {
      platform: 'site_search',
      status: 'ok',
      signals: { searchHitEstimate: 12 },
    };
    expect(scoreD3(platforms)).toBeGreaterThanOrEqual(10);
  });

  it('credits social discovery in D4 via supplement input', () => {
    const platforms = emptyPlatforms();
    const base = scoreD4(platforms, 0);
    const withSocial = scoreD4(platforms, 0, {
      socialCount: 2,
      offSiteDomainCount: 4,
      curationApplied: true,
      curationKept: 3,
    });
    expect(withSocial).toBeGreaterThan(base);
    expect(scoreD4SupplementBonus({ socialCount: 2 })).toBe(4);
  });

  it('assigns band from total on 0-100 scale', () => {
    const platforms = emptyPlatforms();
    platforms.g2 = { platform: 'g2', status: 'ok', signals: { profileExists: true } };
    platforms.capterra = { platform: 'capterra', status: 'ok', signals: { profileExists: true } };
    platforms.trustpilot = {
      platform: 'trustpilot',
      status: 'ok',
      signals: { profileExists: true },
    };
    const scores = computeInfluenceScores({
      platforms,
      redditHighEngagement: 12,
      serperMediaMentions: 2,
    });
    expect(scores.total).toBeGreaterThanOrEqual(50);
    expect(scores.reviews).toBeGreaterThan(0);
    expect(scores.total).toBeLessThanOrEqual(100);
  });

  it('Ferrari-like automotive brand scores at least 50/100 with notability floor', () => {
    const platforms = emptyPlatforms();
    platforms.g2 = {
      platform: 'g2',
      status: 'skipped',
      message: 'B2B software review site',
      signals: {},
    };
    platforms.capterra = {
      platform: 'capterra',
      status: 'skipped',
      message: 'B2B software review site',
      signals: {},
    };
    platforms.reddit = {
      platform: 'reddit',
      status: 'ok',
      signals: { profileExists: true, postCount: 12, highEngagementPostCount: 4 },
      subreddits: ['ferrari', 'cars'],
      posts: Array.from({ length: 12 }, (_, i) => ({
        title: `Post ${i}`,
        upvotes: 100,
        comments: 20,
        awards: 0,
      })),
    };
    platforms.quora = {
      platform: 'quora',
      status: 'ok',
      signals: { profileExists: true },
    };
    platforms.trustpilot = {
      platform: 'trustpilot',
      status: 'limited_data',
      signals: { profileExists: true, reviewCount: 5 },
    };
    platforms.site_search = {
      platform: 'site_search',
      status: 'ok',
      signals: { searchHitEstimate: 15 },
    };

    const scores = computeInfluenceScores({
      platforms,
      redditHighEngagement: 4,
      wikipediaPresent: true,
      entityConfidence: 0.95,
      entityNeedsReview: false,
      searchPlanCategory: 'automotive',
      supplement: {
        socialCount: 2,
        offSiteDomainCount: 8,
        generalHitEstimate: 6,
      },
    });

    expect(scores.total).toBeGreaterThanOrEqual(50);
    expect(scores.raw?.d3).toBeDefined();
  });
});
