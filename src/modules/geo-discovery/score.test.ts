import { describe, expect, it } from 'vitest';
import { mergeProbeScore, scoreHeuristic } from './score';
import type { DiscoveryCandidate } from './types';

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    url: 'https://example.com/faq',
    sources: new Set(['sitemap']),
    navWeight: 0,
    anchorTexts: [],
    lastmod: null,
    title: null,
    ...overrides,
  };
}

describe('scoreHeuristic', () => {
  it('boosts FAQ archetype over generic content', () => {
    const faq = scoreHeuristic({
      candidate: candidate({ url: 'https://example.com/faq' }),
      siteRoot: 'https://example.com',
    });
    const blog = scoreHeuristic({
      candidate: candidate({ url: 'https://example.com/blog/post-1' }),
      siteRoot: 'https://example.com',
    });
    expect(faq.score).toBeGreaterThan(blog.score);
  });

  it('rewards nav prominence and multiple sources', () => {
    const weak = scoreHeuristic({
      candidate: candidate(),
      siteRoot: 'https://example.com',
    });
    const strong = scoreHeuristic({
      candidate: candidate({
        navWeight: 10,
        sources: new Set(['sitemap', 'internal', 'llms']),
      }),
      siteRoot: 'https://example.com',
    });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('excludes utility pages', () => {
    const util = scoreHeuristic({
      candidate: candidate({ url: 'https://example.com/checkout' }),
      siteRoot: 'https://example.com',
    });
    expect(util.score).toBe(0);
  });
});

describe('mergeProbeScore', () => {
  it('applies FAQ schema boost', () => {
    const heuristic = scoreHeuristic({
      candidate: candidate(),
      siteRoot: 'https://example.com',
    });
    const merged = mergeProbeScore(heuristic, {
      schemaTypes: ['FAQPage'],
      faqCount: 4,
      questionHeadings: 2,
    });
    expect(merged.score).toBeGreaterThan(heuristic.score);
    expect(merged.signals.some((s) => s.includes('FAQPage'))).toBe(true);
  });

  it('applies floor for high-value archetypes', () => {
    const heuristic = scoreHeuristic({
      candidate: candidate({ url: 'https://example.com/glossary' }),
      siteRoot: 'https://example.com',
    });
    const merged = mergeProbeScore(heuristic, {
      schemaTypes: [],
      faqCount: 0,
      questionHeadings: 0,
    });
    expect(merged.score).toBeGreaterThanOrEqual(62);
  });
});
