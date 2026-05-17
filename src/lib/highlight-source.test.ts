import { describe, expect, it } from 'vitest';
import {
  buildHighlightedSource,
  buildHighlightedSourceFromRanges,
  buildHighlightedSourceHtml,
  deriveHighlightNeedles,
} from './highlight-source';

describe('deriveHighlightNeedles', () => {
  it('extracts chunk text needles', () => {
    const needles = deriveHighlightNeedles([
      {
        label: 'Weak chunk',
        kind: 'chunk',
        content: 'Answer first sentence here with enough length to match.',
      },
    ]);
    expect(needles.some((n) => n.includes('Answer first'))).toBe(true);
  });

  it('extracts heading needles from html snippets', () => {
    const needles = deriveHighlightNeedles([
      {
        label: 'Headings',
        kind: 'html',
        content: '<h1>Main Title</h1>\n<h2>Subsection</h2>',
      },
    ]);
    expect(needles.some((n) => n.includes('Main Title') || n.includes('<h1>'))).toBe(true);
  });
});

describe('buildHighlightedSourceFromRanges', () => {
  it('wraps byte ranges in mark tags', () => {
    const source = '<html><body><h1>Main Title</h1><p>Other</p></body></html>';
    const start = source.indexOf('Main Title');
    const { html, matchCount } = buildHighlightedSourceFromRanges(source, [
      { start, end: start + 'Main Title'.length },
    ]);
    expect(matchCount).toBe(1);
    expect(html).toContain('<mark class="geo-source-mark">');
    expect(html).toContain('Main Title');
  });
});

describe('buildHighlightedSource', () => {
  it('prefers sourceRanges over needles', () => {
    const source = '<h1 class="x">Hello World</h1>';
    const { html, matchCount } = buildHighlightedSource(source, [
      {
        label: 'H1',
        kind: 'html',
        content: '<h1>Hello</h1>',
        sourceRanges: [{ start: 0, end: source.length }],
      },
    ]);
    expect(matchCount).toBe(1);
    expect(html).toContain('geo-source-mark');
  });

  it('returns mark labels from highlight metadata', () => {
    const source = '<p>Answer first sentence here with enough length to match.</p>';
    const { markLabels, matchCount } = buildHighlightedSource(source, [
      {
        label: 'Weak chunk',
        kind: 'chunk',
        content: 'Answer first sentence here with enough length to match.',
        sourceRanges: [{ start: 3, end: 50 }],
      },
    ]);
    expect(matchCount).toBeGreaterThan(0);
    expect(markLabels[0]).toBe('Weak chunk');
  });

  it('returns problem and fixHint in markDetails', () => {
    const source = '<p>Answer first sentence here with enough length to match.</p>';
    const { markDetails, matchCount } = buildHighlightedSource(source, [
      {
        label: 'Section: Pricing',
        kind: 'chunk',
        content: 'Answer first sentence here with enough length to match.',
        problem: 'No answer-first opening.',
        fixHint: 'Lead with the price answer.',
        sourceRanges: [{ start: 3, end: 50 }],
      },
    ]);
    expect(matchCount).toBeGreaterThan(0);
    expect(markDetails[0]?.problem).toBe('No answer-first opening.');
    expect(markDetails[0]?.fixHint).toBe('Lead with the price answer.');
  });
});

describe('buildHighlightedSourceHtml', () => {
  it('wraps matching regions in mark tags', () => {
    const source = '<html><body><h1>Main Title</h1><p>Other</p></body></html>';
    const { html, matchCount } = buildHighlightedSourceHtml(source, ['Main Title']);
    expect(matchCount).toBeGreaterThan(0);
    expect(html).toContain('<mark class="geo-source-mark">');
    expect(html).toContain('Main Title');
  });

  it('escapes html in source', () => {
    const { html } = buildHighlightedSourceHtml('<script>alert(1)</script>', []);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
