import { describe, expect, it } from 'vitest';
import { parseSearchResults } from './search-engine';

describe('parseSearchResults duckduckgo', () => {
  it('extracts result__a links from DuckDuckGo HTML', () => {
    const html = [
      '<html><body>',
      '<a class="result__a" href="https://www.forbes.com/ferrari">Ferrari - Forbes</a>',
      '<a class="result__a" href="https://www.g2.com/products/ferrari">Ferrari on G2</a>',
      '</body></html>',
    ].join('');

    const { hits } = parseSearchResults(html, 'duckduckgo');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.url.includes('forbes.com'))).toBe(true);
    expect(hits.some((h) => h.url.includes('g2.com'))).toBe(true);
  });
});
