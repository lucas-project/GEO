import { describe, expect, it, vi, afterEach } from 'vitest';
import { ai } from '@shared/ai';
import {
  applyCurationResult,
  buildCurationCandidates,
  curateSearchHits,
  shouldCurateSearchHits,
} from './curate-search-hits';

const brand = {
  primaryBrand: 'Ferrari',
  aliases: ['Ferrari N.V.'],
  confidence: 0.9,
  needsReview: false,
  sources: [],
  flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
  sameAsUrls: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildCurationCandidates', () => {
  it('dedupes platform and social hits', () => {
    const candidates = buildCurationCandidates({
      byPlatform: {
        g2: [
          {
            url: 'https://www.g2.com/products/ferrari',
            engine: 'bing',
            title: 'Ferrari on G2',
          },
        ],
      },
      social: [
        {
          platform: 'facebook',
          url: 'https://www.facebook.com/ferrari',
          title: 'Ferrari',
        },
      ],
      queries: [{ query: '"Ferrari" site:g2.com' }],
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.url)).toContain('https://www.g2.com/products/ferrari');
  });
});

describe('applyCurationResult', () => {
  it('rebuilds byPlatform with highest confidence first', () => {
    const candidates = [
      {
        url: 'https://www.g2.com/products/ferrari-low',
        title: 'Low',
        engine: 'bing' as const,
      },
      {
        url: 'https://www.g2.com/products/ferrari-high',
        title: 'High',
        engine: 'bing' as const,
      },
    ];

    const result = applyCurationResult(
      {
        keep: [
          {
            url: 'https://www.g2.com/products/ferrari-low',
            confidence: 0.4,
            reason: 'weak',
          },
          {
            url: 'https://www.g2.com/products/ferrari-high',
            confidence: 0.95,
            reason: 'strong',
          },
        ],
        reject: [],
      },
      candidates,
      'ferrari.com',
      { provider: 'mock', model: 'test' },
    );

    expect(result.byPlatform.g2?.[0]?.url).toBe('https://www.g2.com/products/ferrari-high');
    expect(result.meta.kept).toBe(2);
  });

  it('drops rejected URLs not in keep list', () => {
    const candidates = [
      { url: 'https://www.facebook.com/ferrari', title: 'Official', engine: 'bing' as const },
      { url: 'https://www.facebook.com/reject-me', title: 'Fan', engine: 'bing' as const },
    ];

    const result = applyCurationResult(
      {
        keep: [
          {
            url: 'https://www.facebook.com/ferrari',
            confidence: 0.9,
            reason: 'official',
          },
        ],
        reject: [{ url: 'https://www.facebook.com/reject-me', reason: 'fan page' }],
      },
      candidates,
      'ferrari.com',
      { provider: 'mock', model: 'test' },
    );

    expect(result.social).toHaveLength(1);
    expect(result.social[0]?.url).toBe('https://www.facebook.com/ferrari');
    expect(result.meta.rejected).toBe(1);
  });
});

describe('curateSearchHits', () => {
  it('returns null when curation disabled', async () => {
    const result = await curateSearchHits({
      brand,
      domain: 'ferrari.com',
      byPlatform: {
        g2: [{ url: 'https://www.g2.com/products/ferrari', engine: 'bing' }],
      },
      social: [],
      queries: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when LLM fails', async () => {
    vi.spyOn(
      await import('./curate-search-hits'),
      'shouldCurateSearchHits',
    ).mockReturnValue(true);
    vi.spyOn(ai, 'generateStructuredOutput').mockRejectedValue(new Error('ollama down'));

    const result = await curateSearchHits({
      brand,
      domain: 'ferrari.com',
      byPlatform: {
        g2: [{ url: 'https://www.g2.com/products/ferrari', engine: 'bing' }],
      },
      social: [],
      queries: [{ query: 'test' }],
    });

    expect(result).toBeNull();
  });
});

describe('shouldCurateSearchHits', () => {
  it('is false when AI provider is mock', () => {
    expect(shouldCurateSearchHits()).toBe(false);
  });
});
