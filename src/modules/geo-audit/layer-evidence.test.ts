import { describe, expect, it } from 'vitest';
import type { PresenceProbeResult } from '@modules/brand-presence-probe';
import type { PresenceSignals } from '@modules/brand-presence';
import { buildLayerEvidence } from './layer-evidence';
import { DIMENSIONS, type Dimension, type DimensionScore } from './schemas';
import { computeHierarchicalScore } from './hierarchical-scoring';

function linkedG2Signals(): PresenceSignals {
  return {
    platforms: {
      reddit: { linked: false, urls: [] },
      quora: { linked: false, urls: [] },
      g2: {
        linked: true,
        urls: ['https://g2.com/products/acme'],
        foundOnPages: ['homepage'],
      },
      capterra: { linked: false, urls: [] },
      trustpilot: { linked: false, urls: [] },
      linkedin: { linked: false, urls: [] },
      x: { linked: false, urls: [] },
      youtube: { linked: false, urls: [] },
      facebook: { linked: false, urls: [] },
      instagram: { linked: false, urls: [] },
      github: { linked: false, urls: [] },
      xiaohongshu: { linked: false, urls: [] },
      zhihu: { linked: false, urls: [] },
      tiktok: { linked: false, urls: [] },
      amazon: { linked: false, urls: [] },
      whirlpool: { linked: false, urls: [] },
      productreview: { linked: false, urls: [] },
      ozbargain: { linked: false, urls: [] },
    },
    sameAsUrls: [],
    sameAsCount: 0,
    hasPricingPage: false,
    hasComparePage: false,
    hasPrimaryCta: false,
    hasTrustSection: false,
    hasProductOffers: false,
    napSignals: { hasContactPage: false, phoneFound: false, emailFound: false },
  } as unknown as PresenceSignals;
}

function uniformDimensions(score: number): Record<Dimension, DimensionScore> {
  return Object.fromEntries(
    DIMENSIONS.map((d) => [d, { score, reasons: [`${d} at ${score}`] }]),
  ) as Record<Dimension, DimensionScore>;
}

const baseCrawl = {
  rootUrl: 'https://acme.com',
  pages: [
    {
      url: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
      statusCode: 200,
      contentType: 'text/html',
      html: null,
      renderedHtml: '<html></html>',
      title: 'Acme',
      fetchedAt: new Date().toISOString(),
      durationMs: 100,
      screenshotPath: null,
      error: null,
      hydrationDelta: null,
      performance: { lcpMs: 1800, mobileBodyTextLength: 500 },
    },
  ],
  robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 100 },
  sitemap: [],
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
};

describe('buildLayerEvidence', () => {
  it('includes search queries in presence digest when probe has them', () => {
    const dimensions = uniformDimensions(50);
    const { scoringMeta } = computeHierarchicalScore({ dimensions });
    const probe: PresenceProbeResult = {
      source: 'serper',
      brandName: 'Acme',
      siteDomain: 'acme.com',
      redditMentionEstimate: 2,
      reviewProfilesFound: [],
      mediaMentions: 0,
      primarySourceDomains: [],
      brandDescriptionSnippet: null,
      verifiedPlatforms: ['g2'],
      searchQueries: [
        {
          query: 'site:g2.com "Acme"',
          resultCount: 2,
          topHits: [{ link: 'https://g2.com/products/acme', snippet: 'Acme reviews' }],
        },
      ],
    };
    const evidence = buildLayerEvidence({
      dimensions,
      gatesApplied: scoringMeta.gatesApplied,
      crawl: baseCrawl,
      rootUrl: 'https://acme.com',
      presenceSignals: linkedG2Signals(),
      presenceProbe: probe,
    });

    expect(evidence.presence.searchQueries).toHaveLength(1);
    expect(evidence.presence.searchQueries?.[0].query).toContain('g2.com');
    expect(evidence.presence.methodology).toContain('Serper');
    expect(evidence.presence.crawlFindings.some((f) => f.label.includes('G2'))).toBe(true);
    expect(evidence.presence.scoreFactors.length).toBeGreaterThan(0);
  });

  it('builds all five layers', () => {
    const dimensions = uniformDimensions(60);
    const { scoringMeta } = computeHierarchicalScore({ dimensions });
    const evidence = buildLayerEvidence({
      dimensions,
      gatesApplied: scoringMeta.gatesApplied,
      crawl: baseCrawl,
      rootUrl: 'https://acme.com',
    });
    expect(Object.keys(evidence)).toHaveLength(5);
    expect(evidence.foundation.methodology).toContain('Playwright');
    expect(evidence.outcome.methodology).toContain('citation');
  });
});
