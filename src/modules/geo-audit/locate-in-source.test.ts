import { describe, expect, it } from 'vitest';
import {
  locateExactInHtml,
  locateTextInHtml,
  locateHeadingTagRanges,
  attachSourceRanges,
} from './locate-in-source';

describe('locateTextInHtml', () => {
  it('finds text in minified HTML', () => {
    const html = '<html><body><p>Answer   first sentence here with enough length.</p></body></html>';
    const ranges = locateTextInHtml(html, 'Answer first sentence here with enough length.');
    expect(ranges.length).toBeGreaterThan(0);
    expect(html.slice(ranges[0].start, ranges[0].end)).toContain('Answer');
  });
});

describe('locateExactInHtml', () => {
  it('finds exact tag markup', () => {
    const html = '<h1 class="title">Main Title</h1>';
    const ranges = locateExactInHtml(html, '<h1 class="title">Main Title</h1>');
    expect(ranges).toHaveLength(1);
    expect(html.slice(ranges[0].start, ranges[0].end)).toBe('<h1 class="title">Main Title</h1>');
  });
});

describe('locateHeadingTagRanges', () => {
  it('locates all h1–h4 tags with attributes and nested markup', () => {
    const html = `
      <main>
        <h2 class="section-title"><span>First section</span></h2>
        <p>body</p>
        <h3 id="sub">Sub section</h3>
        <h2 class="section-title">Second section</h2>
      </main>
    `;
    const ranges = locateHeadingTagRanges(html);
    expect(ranges.length).toBe(3);
    const slices = ranges.map((r) => html.slice(r.start, r.end));
    expect(slices.some((s) => /<h2\b/i.test(s) && s.includes('First section'))).toBe(true);
    expect(slices.some((s) => /<h3\b/i.test(s) && s.includes('Sub section'))).toBe(true);
    expect(slices.some((s) => /<h2\b/i.test(s) && s.includes('Second section'))).toBe(true);
  });

  it('attaches all heading ranges for semantic clarity highlights', () => {
    const html = `
      <h2 class="a">Alpha</h2>
      <h3>Beta</h3>
      <h2 class="b">Gamma</h2>
    `;
    const highlight = {
      label: 'Heading outline (h1–h4)',
      kind: 'html' as const,
      content: '<h2>Alpha</h2>\n<h3>Beta</h3>\n<h2>Gamma</h2>',
    };
    const out = attachSourceRanges(highlight, html, 'semanticClarity');
    expect(out.sourceRanges?.length).toBe(3);
  });
});

describe('attachSourceRanges', () => {
  it('attaches ranges for chunk highlights', () => {
    const html = '<div><p>This is a long enough chunk of text to locate in source.</p></div>';
    const highlight = {
      label: 'Chunk',
      kind: 'chunk' as const,
      content: 'This is a long enough chunk of text to locate in source.',
    };
    const out = attachSourceRanges(highlight, html, 'semanticClarity');
    expect(out.sourceRanges?.length).toBeGreaterThan(0);
  });
});
