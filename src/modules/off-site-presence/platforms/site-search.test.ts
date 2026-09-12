import { describe, expect, it, vi } from 'vitest';
import { probeSiteSearch } from './site-search';
import * as searchEngine from '../search-engine';
import type { ProbeContext } from './types';
import type { BrandEntityResult } from '../schemas';

function ctx(overrides: Partial<ProbeContext> = {}): ProbeContext {
  const brand: BrandEntityResult = {
    primaryBrand: 'Ferrari',
    aliases: ['ferrari'],
    confidence: 1,
    needsReview: false,
    sources: ['override'],
    flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
    sameAsUrls: [],
  };
  return {
    brand,
    domain: 'ferrari.com',
    siteUrl: 'https://ferrari.com',
    fetchPage: vi.fn(),
    sameAsUrls: [],
    searchSupplement: {
      queries: [],
      byPlatform: {
        reddit: [{ url: 'https://www.reddit.com/r/ferrari', engine: 'bing', title: 'r/ferrari' }],
      },
      social: [],
      facebookPosts: [],
      crossPlatformPosts: {},
      offSiteDomains: ['reddit.com', 'quora.com'],
      discoveryDomains: [],
      generalHitEstimate: 5,
      verticalHits: {},
      verticalDomains: [],
    },
    ...overrides,
  };
}

describe('probeSiteSearch', () => {
  it('aggregates supplement without calling SERP', async () => {
    const serp = vi.spyOn(searchEngine, 'runBingDdgSearch');
    const result = await probeSiteSearch(ctx());
    expect(result.status).toBe('ok');
    expect(result.signals.searchHitEstimate).toBeGreaterThan(0);
    expect(result.raw?.source).toBe('targeted-search-supplement');
    expect(serp).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
