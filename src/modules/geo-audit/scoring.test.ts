import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from './schemas';
import { deriveIssuesAndFixes, scoreAll, type ScoringContext } from './scoring';
import type { PresenceProbeResult } from '@modules/brand-presence-probe';
import type { CrawlResult, CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { emptyPageChecklist } from '@modules/extraction';

describe('geo-audit scoring dimensions', () => {
  it('defines exactly 12 blueprint dimensions', () => {
    expect(DIMENSIONS).toHaveLength(12);
    expect(new Set(DIMENSIONS).size).toBe(12);
  });
});

function page(url: string, extraction: PageExtraction): { page: CrawledPage; extraction: PageExtraction } {
  return {
    page: {
      url,
      finalUrl: url,
      statusCode: 200,
      contentType: 'text/html',
      html: null,
      renderedHtml: `<html><head><title>T</title></head><body><h1>H</h1></body></html>`,
      title: null,
      fetchedAt: new Date().toISOString(),
      durationMs: 0,
      screenshotPath: null,
      error: null,
      hydrationDelta: null,
    },
    extraction,
  };
}

describe('deriveIssuesAndFixes impactedPages', () => {
  it('includes impactedPages on issues when context has failing pages', () => {
    const emptyExtraction: PageExtraction = {
      url: 'https://example.com/blog',
      metadata: {
        title: null,
        description: null,
        canonical: null,
        ogTitle: null,
        ogSiteName: null,
        ogDescription: null,
        ogType: null,
        twitterCard: null,
        language: null,
        charset: null,
        robots: null,
      },
      headings: [],
      schemas: [],
      faqs: [],
      entities: [],
      chunks: [],
      links: [],
      tables: [],
      authors: [],
      checklist: emptyPageChecklist(),
    };

    const ctx: ScoringContext = {
      url: 'https://example.com',
      rootPage: page('https://example.com', emptyExtraction).page,
      extraction: emptyExtraction,
      crawl: {
        rootUrl: 'https://example.com',
        pages: [],
        robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
        sitemap: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
      pageExtractions: [page('https://example.com/blog', emptyExtraction)],
    };

    const dimensions = {
      aiReadability: { score: 80, reasons: [] },
      citationFriendliness: { score: 80, reasons: [] },
      semanticClarity: { score: 80, reasons: [] },
      entityClarity: { score: 80, reasons: [] },
      answerExtraction: { score: 80, reasons: [] },
      chunkOptimization: { score: 80, reasons: [] },
      summarizationQuality: { score: 80, reasons: [] },
      trustSignals: { score: 80, reasons: [] },
      structuredContent: { score: 40, reasons: ['No JSON-LD structured data found on site'] },
      crawlerFriendliness: { score: 80, reasons: [] },
      offSitePresence: { score: 80, reasons: [] },
      commercialReadiness: { score: 80, reasons: [] },
    };

    const { issues } = deriveIssuesAndFixes(dimensions, ctx);
    const structured = issues.find((i) => i.dimension === 'structuredContent');
    expect(structured?.details?.impactedPages?.length).toBeGreaterThan(0);
    expect(structured?.summaryPlain).toBeTruthy();
  });

  it('emits one issue per negative reason without an 8-issue cap', () => {
    const weak = (reasons: string[]) => ({ score: 30, reasons });
    const dimensions = {
      aiReadability: weak(['Too few words', 'No lang attribute', 'JS-heavy hydration']),
      citationFriendliness: weak(['No FAQ blocks', 'No author attribution']),
      semanticClarity: weak(['Missing H1', 'No H2 sections']),
      entityClarity: weak(['Few entities', 'No Organization schema']),
      answerExtraction: weak(['Sections lack answer-first openings']),
      chunkOptimization: { score: 80, reasons: [] },
      summarizationQuality: { score: 80, reasons: [] },
      trustSignals: { score: 80, reasons: [] },
      structuredContent: { score: 80, reasons: [] },
      crawlerFriendliness: { score: 80, reasons: [] },
      offSitePresence: { score: 80, reasons: [] },
      commercialReadiness: { score: 80, reasons: [] },
    };

    const { issues } = deriveIssuesAndFixes(dimensions);
    expect(issues.length).toBeGreaterThan(8);
    expect(issues.filter((i) => i.dimension === 'semanticClarity').length).toBe(2);
  });

  it('dedupes the same FAQ gap reported per audited page into one issue', () => {
    const dimensions = {
      aiReadability: { score: 80, reasons: [] },
      citationFriendliness: {
        score: 40,
        reasons: [
          'Aggregated across 3 audited pages (homepage weighted 2×)',
          '/blog: No FAQ blocks — LLMs cite Q/A content disproportionately',
          '/about: No FAQ blocks — LLMs cite Q/A content disproportionately',
          '/contact: No FAQ blocks — LLMs cite Q/A content disproportionately',
          'No author/byline signals — reduces citation trust',
        ],
      },
      semanticClarity: { score: 80, reasons: [] },
      entityClarity: { score: 80, reasons: [] },
      answerExtraction: { score: 80, reasons: [] },
      chunkOptimization: { score: 80, reasons: [] },
      summarizationQuality: { score: 80, reasons: [] },
      trustSignals: { score: 80, reasons: [] },
      structuredContent: { score: 80, reasons: [] },
      crawlerFriendliness: { score: 80, reasons: [] },
      offSitePresence: { score: 80, reasons: [] },
      commercialReadiness: { score: 80, reasons: [] },
    };

    const { issues } = deriveIssuesAndFixes(dimensions);
    const faqIssues = issues.filter((i) => i.id === 'issue-missing-faq');
    expect(faqIssues).toHaveLength(1);
    expect(faqIssues[0]?.title).toMatch(/Q&A|FAQ/i);
  });
});

function emptySignals(): NonNullable<ScoringContext['presenceSignals']> {
  return {
    platforms: {
      reddit: { linked: false, urls: [] },
      quora: { linked: false, urls: [] },
      g2: { linked: false, urls: [] },
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

function minimalCtx(presenceSignals: ScoringContext['presenceSignals']): ScoringContext {
  const ext = page('https://example.com', {
    url: 'https://example.com',
    metadata: {
      title: 'Acme',
      description: null,
      canonical: null,
      ogTitle: null,
      ogSiteName: null,
      ogDescription: null,
      ogType: null,
      twitterCard: null,
      language: null,
      charset: null,
      robots: null,
    },
    headings: [],
    schemas: [],
    faqs: [],
    entities: [],
    chunks: [],
    links: [],
    tables: [],
    authors: [],
    checklist: emptyPageChecklist(),
  }).extraction;
  return {
    url: 'https://example.com',
    rootPage: page('https://example.com', ext).page,
    extraction: ext,
    crawl: {
      rootUrl: 'https://example.com',
      pages: [],
      robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
      sitemap: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
    presenceSignals,
  };
}

describe('scoreOffSitePresence with probe', () => {
  it('uses a floor above 1 when no platforms are linked', () => {
    const score = scoreAll(minimalCtx(emptySignals())).dimensions.offSitePresence.score;
    expect(score).toBeGreaterThanOrEqual(18);
    expect(score).toBeLessThan(35);
  });

  it('boosts score when Serper verifies platforms', () => {
    const base = minimalCtx(emptySignals());
    const without = scoreAll(base).dimensions.offSitePresence.score;
    const probe: PresenceProbeResult = {
      source: 'serper',
      brandName: 'Acme',
      siteDomain: 'acme.com',
      redditMentionEstimate: 3,
      reviewProfilesFound: ['https://www.g2.com/products/acme'],
      mediaMentions: 1,
      primarySourceDomains: ['techcrunch.com'],
      brandDescriptionSnippet: 'Acme Corp',
      verifiedPlatforms: ['g2', 'reddit'],
      searchQueries: [
        {
          query: 'site:reddit.com "Acme"',
          resultCount: 3,
          topHits: [{ link: 'https://reddit.com/r/saas/comments/x', snippet: 'Acme is great' }],
        },
      ],
    };
    const withProbe = scoreAll({ ...base, presenceProbe: probe }).dimensions.offSitePresence.score;
    expect(withProbe).toBeGreaterThan(without);
  });

  it('raises floor when a platform is linked on-site', () => {
    const signals = emptySignals();
    signals.platforms.g2 = { linked: true, urls: ['https://www.g2.com/products/acme'] };
    const score = scoreAll(minimalCtx(signals)).dimensions.offSitePresence.score;
    expect(score).toBeGreaterThanOrEqual(32);
  });

  it('scores established brands fairly with multiple social links (BMW-like)', () => {
    const signals = emptySignals();
    signals.platforms.linkedin = {
      linked: true,
      urls: ['https://www.linkedin.com/company/bmw'],
    };
    signals.platforms.facebook = { linked: true, urls: ['https://www.facebook.com/BMW'] };
    signals.platforms.instagram = { linked: true, urls: ['https://www.instagram.com/bmw'] };
    signals.platforms.youtube = { linked: true, urls: ['https://www.youtube.com/@BMW'] };

    const crawlOnly = scoreAll(minimalCtx(signals)).dimensions.offSitePresence.score;
    expect(crawlOnly).toBeGreaterThanOrEqual(55);

    const probe: PresenceProbeResult = {
      source: 'serper',
      brandName: 'BMW',
      siteDomain: 'bmw.com',
      redditMentionEstimate: 5,
      reviewProfilesFound: ['https://www.trustpilot.com/review/bmw.com'],
      mediaMentions: 2,
      primarySourceDomains: ['forbes.com', 'reuters.com'],
      brandDescriptionSnippet: 'BMW is a German luxury vehicle manufacturer',
      verifiedPlatforms: ['reddit', 'linkedin', 'youtube'],
      searchQueries: [],
    };
    const withProbe = scoreAll({ ...minimalCtx(signals), presenceProbe: probe }).dimensions
      .offSitePresence.score;
    expect(withProbe).toBeGreaterThanOrEqual(70);
    expect(withProbe).toBeGreaterThan(crawlOnly);
  });
});
