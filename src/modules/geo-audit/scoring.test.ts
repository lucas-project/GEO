import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from './schemas';
import { deriveIssuesAndFixes, type ScoringContext } from './scoring';
import type { CrawlResult, CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';

describe('geo-audit scoring dimensions', () => {
  it('defines exactly 10 blueprint dimensions', () => {
    expect(DIMENSIONS).toHaveLength(10);
    expect(new Set(DIMENSIONS).size).toBe(10);
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
    };

    const { issues } = deriveIssuesAndFixes(dimensions);
    const faqIssues = issues.filter((i) => i.id === 'issue-missing-faq');
    expect(faqIssues).toHaveLength(1);
    expect(faqIssues[0]?.title).toMatch(/Q&A|FAQ/i);
  });
});
