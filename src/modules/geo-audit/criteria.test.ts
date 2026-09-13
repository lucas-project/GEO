import { describe, expect, it } from 'vitest';
import { emptyPageChecklist, type PageExtraction } from '@modules/extraction';
import type { CrawledPage, CrawlResult } from '@modules/crawling';
import { buildEvidenceBundle } from './evidence';
import { evaluateReadinessCriteria } from './criteria';

const page = (fetchStatus: CrawledPage['fetchStatus']): CrawledPage => ({
  url: 'https://example.test/docs', finalUrl: 'https://example.test/docs', statusCode: fetchStatus === 'observed' ? 200 : 403,
  contentType: 'text/html', html: '<html/>', renderedHtml: fetchStatus === 'observed' ? '<main>Documentation content</main>' : null,
  title: null, fetchedAt: '2026-09-12T00:00:00.000Z', durationMs: 1, screenshotPath: null,
  error: fetchStatus === 'observed' ? null : 'blocked', hydrationDelta: null, fetchStatus,
});
const extraction: PageExtraction = {
  url: 'https://example.test/docs', metadata: { title: 'Docs', description: null, canonical: null, ogTitle: null, ogSiteName: null, ogDescription: null, ogType: null, twitterCard: null, language: null, charset: null, robots: null },
  headings: [{ level: 1, text: 'Docs' }], schemas: [], faqs: [], entities: [],
  chunks: [{ id: 'one', heading: null, text: 'This documentation page contains enough text to locate and inspect the information.', wordCount: 12, hasAnswerFirstSentence: false, hasList: false, hasNumbers: false }],
  links: [], tables: [], authors: [], checklist: emptyPageChecklist(),
};
const crawl = (p: CrawledPage): CrawlResult => ({ rootUrl: p.url, pages: [p], robots: { fetched: true, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 }, sitemap: [], startedAt: '2026-09-12T00:00:00.000Z', finishedAt: '2026-09-12T00:00:01.000Z' });

describe('readiness criteria', () => {
  it('does not require FAQ, pricing, or authors for a documentation page baseline', () => {
    const observed = page('observed');
    const bundle = buildEvidenceBundle({ crawl: crawl(observed), pageExtractions: [{ page: observed, extraction }], capturedAt: '2026-09-12T00:00:02.000Z' });
    const ids = evaluateReadinessCriteria({ evidenceBundle: bundle, pages: [{ page: observed, extraction }] }).map((c) => c.criterionId);
    expect(ids.some((id) => /faq|pricing|author/i.test(id))).toBe(false);
  });

  it('marks a blocked page unknown instead of failed', () => {
    const blocked = page('blocked');
    const bundle = buildEvidenceBundle({ crawl: crawl(blocked), pageExtractions: [{ page: blocked, extraction }], capturedAt: '2026-09-12T00:00:02.000Z' });
    expect(evaluateReadinessCriteria({ evidenceBundle: bundle, pages: [{ page: blocked, extraction }] }).every((c) => c.outcome === 'unknown')).toBe(true);
  });
});
