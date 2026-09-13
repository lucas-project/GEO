import { describe, expect, it, vi } from 'vitest';
import { parseSearchResults, runBingDdgSearch, serpCacheKey } from './search-engine';
import type { FetchPageFn } from './platforms/types';
import { cache } from '@shared/cache';

const BING_HTML = `
<html><body>
<ol id="b_results">
<li class="b_algo">
  <h2><a href="https://www.g2.com/products/acme-corp/reviews">Acme on G2</a></h2>
  <div class="b_caption"><p>Product reviews and ratings</p></div>
</li>
<li class="b_algo">
  <h2><a href="https://www.acme.com/about">About Acme</a></h2>
</li>
</ol>
<div class="sb_count">About 1,200 results</div>
</body></html>
`;

describe('parseSearchResults', () => {
  it('extracts external URLs and titles from Bing HTML', () => {
    const { hits, hitEstimate, domains } = parseSearchResults(BING_HTML, 'bing');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]?.url).toContain('g2.com');
    expect(hits[0]?.title).toContain('G2');
    expect(domains).toContain('g2.com');
    expect(hitEstimate).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates and caps hits', () => {
    const dupHtml = BING_HTML + BING_HTML;
    const { hits } = parseSearchResults(dupHtml, 'bing');
    const urls = new Set(hits.map((h) => h.url));
    expect(urls.size).toBe(hits.length);
  });
});

describe('runBingDdgSearch httpOnly', () => {
  it('uses the budgeted fetchPage HTTP path when httpOnly is true', async () => {
    const fetchPage = vi.fn<FetchPageFn>().mockResolvedValue({
      html: '', statusCode: 503, finalUrl: 'https://search.test', observationStatus: 'unreachable',
    });

    await runBingDdgSearch('test brand', fetchPage, { httpOnly: true });

    expect(fetchPage).toHaveBeenCalled();
    expect(fetchPage.mock.calls.every(([, options]) => options?.httpOnly === true)).toBe(true);
  });
});

describe('runBingDdgSearch cache', () => {
  it('reuses successful results', async () => {
    const query = 'cache fixture brand';
    await cache.delete(serpCacheKey(query, { httpOnly: true }));
    const fetchPage = vi.fn<FetchPageFn>().mockResolvedValue({
      html: BING_HTML, statusCode: 200, finalUrl: 'https://www.bing.com/search', observationStatus: 'observed',
    });
    await runBingDdgSearch(query, fetchPage, { httpOnly: true });
    await runBingDdgSearch(query, fetchPage, { httpOnly: true });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    await cache.delete(serpCacheKey(query, { httpOnly: true }));
  });
});
