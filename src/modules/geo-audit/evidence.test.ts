import { describe, expect, it } from 'vitest';
import type { CrawlResult, CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { emptyPageChecklist } from '@modules/extraction';
import { buildEvidenceBundle } from './evidence';

function extraction(url: string, complete = true): PageExtraction {
  return {
    url,
    metadata: {
      title: complete ? 'Acme' : null,
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
    headings: complete ? [{ level: 1, text: 'Acme' }] : [],
    schemas: complete ? [{ type: 'Organization', raw: {} }] : [],
    faqs: [],
    entities: [],
    chunks: complete
      ? [{ id: 'chunk-1', heading: null, text: 'About Acme', wordCount: 2, hasAnswerFirstSentence: true, hasList: false, hasNumbers: false }]
      : [],
    links: [],
    tables: [],
    authors: [],
    checklist: emptyPageChecklist(),
  };
}

function page(url: string, status: CrawledPage['fetchStatus'] = 'observed'): CrawledPage {
  return {
    url,
    finalUrl: url,
    statusCode: status === 'observed' ? 200 : 403,
    contentType: 'text/html',
    html: '<html></html>',
    renderedHtml: status === 'observed' ? '<html><body>Acme</body></html>' : null,
    title: null,
    fetchedAt: '2026-09-12T00:00:00.000Z',
    durationMs: 10,
    screenshotPath: null,
    error: status === 'observed' ? null : 'blocked by WAF',
    hydrationDelta: null,
    fetchStatus: status,
    contentHash: `hash-${status}`,
  };
}

const crawl = (pages: CrawledPage[]): CrawlResult => ({
  rootUrl: 'https://acme.com',
  pages,
  robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
  sitemap: [],
  startedAt: '2026-09-12T00:00:00.000Z',
  finishedAt: '2026-09-12T00:00:01.000Z',
});

describe('buildEvidenceBundle', () => {
  it('is deterministic for the same crawl and capture time', () => {
    const observed = page('https://acme.com', 'observed');
    const input = { crawl: crawl([observed]), pageExtractions: [{ page: observed, extraction: extraction(observed.url) }], capturedAt: '2026-09-12T00:00:02.000Z' };
    expect(buildEvidenceBundle(input)).toEqual(buildEvidenceBundle(input));
  });

  it('preserves blocked acquisition as unknown evidence with reduced coverage', () => {
    const blocked = page('https://acme.com/pricing', 'blocked');
    const bundle = buildEvidenceBundle({
      crawl: crawl([blocked]),
      pageExtractions: [{ page: blocked, extraction: extraction(blocked.url, false) }],
      capturedAt: '2026-09-12T00:00:02.000Z',
    });
    expect(bundle.evidence[0]?.status).toBe('blocked');
    expect(bundle.criteria).toHaveLength(1);
    expect(bundle.criteria[0]?.outcome).toBe('unknown');
    expect(bundle.criteria[0]?.earned).toBeNull();
    expect(bundle.coverage).toBe(0);
  });

  it('treats unreachable acquisition as unknown, not content fail', () => {
    const unreachable: CrawledPage = {
      ...page('https://acme.com/docs', 'unreachable'),
      statusCode: 0,
      error: 'Could not connect',
      acquisitionDetail: {
        stage: 'navigation',
        reasonCode: 'err_failed_unclassified',
        userMessage: 'The page may work normally, but GEO could not finish loading it.',
        nextAction: 'Retry once.',
        technicalMessage: 'net::ERR_FAILED',
      },
    };
    const bundle = buildEvidenceBundle({
      crawl: crawl([unreachable]),
      pageExtractions: [{ page: unreachable, extraction: extraction(unreachable.url, false) }],
      capturedAt: '2026-09-12T00:00:02.000Z',
    });
    expect(bundle.criteria[0]?.outcome).toBe('unknown');
    expect(bundle.criteria[0]?.confidenceReason).toContain("Excluded from this page's evidence");
    expect(bundle.criteria[0]?.confidenceReason).not.toMatch(/ERR_FAILED|legacy_unknown/);
  });

  it('marks observed thin content as content fail, not acquisition unknown', () => {
    const thin = page('https://acme.com/empty', 'observed');
    const bundle = buildEvidenceBundle({
      crawl: crawl([thin]),
      pageExtractions: [{ page: thin, extraction: extraction(thin.url, false) }],
      capturedAt: '2026-09-12T00:00:02.000Z',
    });
    const semantic = bundle.criteria.find((c) => c.criterionId === 'page.semantic_content');
    expect(semantic?.outcome).toBe('fail');
    expect(bundle.criteria.every((c) => c.outcome !== 'unknown')).toBe(true);
  });

  it('emits page criteria and evidence locators for observed content', () => {
    const observed = page('https://acme.com', 'observed');
    const bundle = buildEvidenceBundle({
      crawl: crawl([observed]),
      pageExtractions: [{ page: observed, extraction: extraction(observed.url) }],
      capturedAt: '2026-09-12T00:00:02.000Z',
    });
    expect(bundle.coverage).toBe(1);
    expect(bundle.criteria.map((criterion) => criterion.criterionId)).toEqual([
      'page.title_present',
      'page.single_h1',
      'page.jsonld_parseable',
      'page.semantic_content',
    ]);
    expect(bundle.criteria.every((criterion) => criterion.evidenceIds.length > 0)).toBe(true);
    expect(bundle.evidence.map((item) => item.locator)).toContain('head > title');
  });
});
