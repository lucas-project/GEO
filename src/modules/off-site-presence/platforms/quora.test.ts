import { describe, expect, it, vi } from 'vitest';

vi.mock('../fetch-off-site-page', () => ({
  fetchOffSiteHttp: vi.fn(() => {
    throw new Error('fetchOffSiteHttp should not run when supplement has Quora hits');
  }),
}));

import { probeQuora } from './quora';
import type { ProbeContext } from './types';

const baseCtx = {
  brand: {
    primaryBrand: 'Acme Corp', sameAsUrls: [], aliases: [], confidence: 1,
    needsReview: false, sources: ['test'],
    flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
  },
  domain: 'acme.com',
  siteUrl: 'https://acme.com',
  fetchPage: vi.fn(),
  sameAsUrls: [],
} satisfies Omit<ProbeContext, 'searchSupplement'>;

describe('probeQuora', () => {
  it('returns immediately from search supplement hits without fetching', async () => {
    const fetchPage = vi.fn();
    const result = await probeQuora({
      ...baseCtx,
      fetchPage,
      searchSupplement: {
        byPlatform: {
          quora: [
            {
              url: 'https://www.quora.com/question/what-is-acme',
              title: 'What is Acme?',
              engine: 'bing',
            },
          ],
        },
        social: [],
        facebookPosts: [],
        crossPlatformPosts: {},
        queries: [],
        offSiteDomains: [],
        discoveryDomains: [],
        generalHitEstimate: 0,
        verticalHits: {},
        verticalDomains: [],
        discovery: [],
      },
    } as ProbeContext);

    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.status).toBe('limited_data');
    expect(result.signals.profileExists).toBe(true);
    expect(result.raw?.searchEvidence).toBe(true);
  });
});
