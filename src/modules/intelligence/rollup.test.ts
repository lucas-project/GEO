import { describe, expect, it } from 'vitest';
import type { PageExtraction } from '@modules/extraction';
import { emptyPageChecklist } from '@modules/extraction';
import { extractRollupSignals, listPatternsFromSignals, legacyFieldsFromSignals } from './rollup';

function page(partial: Partial<PageExtraction>): PageExtraction {
  return {
    url: 'https://example.com',
    metadata: {
      title: 'T',
      description: null,
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
    headings: [],
    schemas: [],
    faqs: [],
    entities: [],
    chunks: [],
    links: [],
    tables: [],
    authors: [],
    checklist: emptyPageChecklist(),
    ...partial,
  };
}

describe('extractRollupSignals', () => {
  it('aggregates schema types, faqs, and answer-first ratio', () => {
    const signals = extractRollupSignals([
      page({
        schemas: [{ type: 'FAQPage', raw: '{}' }],
        faqs: [{ question: 'Q?', answer: 'A', source: 'schema' }],
        chunks: [
          {
            id: 'c1',
            text: 'a',
            heading: null,
            wordCount: 10,
            hasAnswerFirstSentence: true,
            hasList: false,
            hasNumbers: false,
          },
          {
            id: 'c2',
            text: 'b',
            heading: null,
            wordCount: 10,
            hasAnswerFirstSentence: false,
            hasList: false,
            hasNumbers: false,
          },
        ],
      }),
    ]);
    const legacy = legacyFieldsFromSignals(signals);
    expect(legacy.schemaTypes).toEqual(['FAQPage']);
    expect(legacy.faqCount).toBe(1);
    expect(legacy.chunkCount).toBe(2);
    expect(legacy.answerFirstRatio).toBe(0.5);
    expect(signals.faq.schemaBacked).toBe(true);
  });

  it('returns null answerFirstRatio when no chunks', () => {
    const signals = extractRollupSignals([page({})]);
    expect(signals.chunks.answerFirstRatio).toBeNull();
  });

  it('computes hierarchy and entity patterns', () => {
    const signals = extractRollupSignals([
      page({
        headings: [
          { level: 1, text: 'Title' },
          { level: 2, text: 'Sub' },
        ],
        entities: [{ name: 'Acme Corp', kind: 'organization', count: 1, relevance: 0.9 }],
        tables: [{ caption: null, headers: ['A', 'B'], rows: [['1', '2']] }],
      }),
    ]);
    expect(signals.hierarchy.h1Count).toBe(1);
    expect(signals.hierarchy.skippedLevels).toBe(0);
    expect(signals.entities.orgPresent).toBe(true);
    expect(signals.tables.comparisonTableCount).toBe(1);

    const patterns = listPatternsFromSignals(signals);
    expect(patterns.some((p) => p.patternKey === 'clean-h1-h2')).toBe(true);
    expect(patterns.some((p) => p.patternKey === 'organization-present')).toBe(true);
    expect(patterns.some((p) => p.patternKey === 'has-comparison')).toBe(true);
  });

  it('includes readability from dimension scores', () => {
    const signals = extractRollupSignals([page({})], { aiReadability: 82 });
    expect(signals.readability.aiReadability).toBe(82);
    const patterns = listPatternsFromSignals(signals);
    expect(patterns.some((p) => p.patternKey === 'ai-readability-high')).toBe(true);
  });
});
