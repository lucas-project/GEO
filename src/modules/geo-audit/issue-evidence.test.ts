import { describe, expect, it } from 'vitest';
import {
  pageReasonsForDimension,
  htmlFocusSnippet,
  isPageAffectedForDimension,
  buildImpactedPagesFromExtractionRow,
} from './issue-evidence';
import type { CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { emptyPageChecklist } from '@modules/extraction';

const stubPage: CrawledPage = {
  url: 'https://example.com/page',
  finalUrl: 'https://example.com/page',
  statusCode: 200,
  contentType: 'text/html',
  html: null,
  renderedHtml: null,
  title: null,
  fetchedAt: new Date().toISOString(),
  durationMs: 0,
  screenshotPath: null,
  error: null,
  hydrationDelta: null,
};

function extraction(partial: Partial<PageExtraction>): PageExtraction {
  return {
    url: 'https://example.com/page',
    metadata: {
      title: 'T',
      description: 'Short',
      canonical: null,
      ogTitle: null,
      ogSiteName: null,
      ogDescription: null,
      ogType: null,
      twitterCard: null,
      language: 'en',
      charset: null,
      robots: null,
    },
    headings: [
      { level: 1, text: 'Title' },
      { level: 2, text: 'Section' },
    ],
    schemas: [],
    faqs: [],
    entities: [],
    chunks: [
      {
        id: 'c1',
        text: 'Answer first sentence here. More content follows.',
        heading: 'Intro',
        wordCount: 12,
        hasAnswerFirstSentence: true,
        hasList: false,
        hasNumbers: false,
      },
    ],
    links: [],
    tables: [],
    authors: [],
    checklist: emptyPageChecklist(),
    ...partial,
  };
}

describe('pageReasonsForDimension', () => {
  it('lists semantic clarity failures', () => {
    const ext = extraction({
      headings: [{ level: 2, text: 'Only h2' }],
    });
    const reasons = pageReasonsForDimension('semanticClarity', stubPage, ext);
    expect(reasons.some((r) => r.includes('H1'))).toBe(true);
  });
});

describe('htmlFocusSnippet', () => {
  it('extracts heading outline from rendered HTML', () => {
    const html = `<html><body><h1>Main</h1><h2>Sub</h2></body></html>`;
    const snip = htmlFocusSnippet('semanticClarity', html);
    expect(snip?.kind).toBe('html');
    expect(snip?.content).toContain('h1');
    expect(snip?.content).toContain('Main');
  });
});

describe('buildImpactedPagesFromExtractionRow', () => {
  it('returns impact when page fails structured content check', () => {
    const row = {
      url: 'https://example.com',
      metadata: JSON.stringify({ description: 'A long enough meta description for the page to pass other checks easily here.' }),
      headings: JSON.stringify([{ level: 1, text: 'T' }, { level: 2, text: 'A' }, { level: 2, text: 'B' }]),
      schemas: '[]',
      faqs: '[]',
      authors: '[]',
      chunks: JSON.stringify([
        {
          id: 'c1',
          text: 'content',
          heading: null,
          wordCount: 100,
          hasAnswerFirstSentence: true,
        },
      ]),
      entities: '[]',
    };
    const impact = buildImpactedPagesFromExtractionRow(
      'structuredContent',
      'https://example.com',
      row,
    );
    expect(impact).not.toBeNull();
    expect(impact!.pageReasons.some((r) => r.includes('JSON-LD'))).toBe(true);
  });
});

describe('isPageAffectedForDimension', () => {
  it('flags pages without FAQs for citation friendliness', () => {
    expect(isPageAffectedForDimension('citationFriendliness', stubPage, extraction({ faqs: [] }))).toBe(
      true,
    );
  });
});
