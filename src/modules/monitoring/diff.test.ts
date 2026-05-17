import { describe, expect, it } from 'vitest';
import { stringifyJson } from '@shared/database/client';
import {
  diffAudits,
  signalsFromExtractions,
  crawlHealthFromResults,
  competitorSignalsFromReports,
} from './diff';

const baseDims = stringifyJson({
  aiReadability: { score: 70, reasons: [] },
  citationFriendliness: { score: 70, reasons: [] },
  semanticClarity: { score: 70, reasons: [] },
  entityClarity: { score: 70, reasons: [] },
  answerExtraction: { score: 70, reasons: [] },
  chunkOptimization: { score: 70, reasons: [] },
  summarizationQuality: { score: 70, reasons: [] },
  trustSignals: { score: 70, reasons: [] },
  structuredContent: { score: 70, reasons: [] },
  crawlerFriendliness: { score: 70, reasons: [] },
});

describe('signalsFromExtractions', () => {
  it('merges schema types, entities, and hierarchy', () => {
    const sig = signalsFromExtractions([
      {
        schemas: stringifyJson([{ type: 'FAQPage' }]),
        faqs: stringifyJson([{ q: 1 }]),
        entities: stringifyJson([{ name: 'Acme', kind: 'organization', count: 1, relevance: 1 }]),
        headings: stringifyJson([{ level: 1 }, { level: 2 }]),
        chunks: '[]',
      },
    ]);
    expect(sig.schemaTypes).toEqual(['FAQPage']);
    expect(sig.faqCount).toBe(1);
    expect(sig.orgPresent).toBe(true);
    expect(sig.hierarchyOutlineScore).toBeGreaterThan(0);
  });
});

describe('diffAudits', () => {
  it('emits regression when overall score drops by threshold', () => {
    const { alerts } = diffAudits(
      { overallScore: 80, dimensions: baseDims },
      { overallScore: 65, dimensions: baseDims },
    );
    expect(alerts.some((a) => a.severity === 'regression' && a.title.includes('dropped'))).toBe(true);
  });

  it('detects removed schema types', () => {
    const { alerts, diff } = diffAudits(
      { id: 'a1', overallScore: 70, dimensions: baseDims },
      { id: 'a2', overallScore: 70, dimensions: baseDims },
      {
        prevExtraction: {
          schemaTypes: ['FAQPage', 'Organization'],
          faqCount: 2,
          entityUniqueCount: 2,
          orgPresent: true,
          hierarchyOutlineScore: 80,
          chunkCount: 4,
          answerFirstRatio: 0.5,
        },
        curExtraction: {
          schemaTypes: ['Organization'],
          faqCount: 2,
          entityUniqueCount: 2,
          orgPresent: true,
          hierarchyOutlineScore: 80,
          chunkCount: 4,
          answerFirstRatio: 0.5,
        },
      },
    );
    expect(diff.schemas.removed).toContain('FAQPage');
    expect(alerts.some((a) => a.kind === 'schema' && a.title.includes('Schema drift'))).toBe(true);
  });

  it('detects citation visibility regression', () => {
    const { alerts } = diffAudits(
      { overallScore: 70, dimensions: baseDims },
      { overallScore: 70, dimensions: baseDims },
      {
        prevCitation: { targetVisibilityScore: 0.8 },
        curCitation: { targetVisibilityScore: 0.4 },
      },
    );
    expect(alerts.some((a) => a.kind === 'citation')).toBe(true);
  });

  it('detects extraction failure increase', () => {
    const { alerts } = diffAudits(
      { overallScore: 70, dimensions: baseDims },
      { overallScore: 70, dimensions: baseDims },
      {
        prevCrawl: { pageCount: 3, errorCount: 0 },
        curCrawl: { pageCount: 3, errorCount: 2 },
      },
    );
    expect(alerts.some((a) => a.kind === 'extraction')).toBe(true);
  });

  it('detects organization entity loss', () => {
    const { alerts } = diffAudits(
      { overallScore: 70, dimensions: baseDims },
      { overallScore: 70, dimensions: baseDims },
      {
        prevExtraction: {
          schemaTypes: [],
          faqCount: 0,
          entityUniqueCount: 1,
          orgPresent: true,
          hierarchyOutlineScore: 50,
          chunkCount: 0,
          answerFirstRatio: null,
        },
        curExtraction: {
          schemaTypes: [],
          faqCount: 0,
          entityUniqueCount: 0,
          orgPresent: false,
          hierarchyOutlineScore: 50,
          chunkCount: 0,
          answerFirstRatio: null,
        },
      },
    );
    expect(alerts.some((a) => a.kind === 'entity' && a.title.includes('Organization'))).toBe(true);
  });

  it('detects competitor behind target', () => {
    const { alerts } = diffAudits(
      { overallScore: 70, dimensions: baseDims },
      { overallScore: 70, dimensions: baseDims },
      {
        curCompetitors: {
          behindCount: 1,
          gaps: [{ competitorUrl: 'https://rival.com', overallGap: -5 }],
        },
      },
    );
    expect(alerts.some((a) => a.kind === 'competitor')).toBe(true);
  });
});

describe('crawlHealthFromResults', () => {
  it('counts pages with errors', () => {
    const h = crawlHealthFromResults([
      { error: null, renderedHtml: '<p>x</p>' },
      { error: 'timeout', renderedHtml: null },
    ]);
    expect(h.pageCount).toBe(2);
    expect(h.errorCount).toBe(1);
  });
});

describe('competitorSignalsFromReports', () => {
  it('counts competitors ahead of target', () => {
    const s = competitorSignalsFromReports([
      {
        competitorUrl: 'https://a.com',
        diff: stringifyJson({ overallGap: -3 }),
      },
    ]);
    expect(s.behindCount).toBe(1);
  });
});
