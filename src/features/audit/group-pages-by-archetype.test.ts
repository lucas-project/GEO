import { describe, expect, it } from 'vitest';
import { groupPagesByArchetype } from './group-pages-by-archetype';
import type { AuditPageEntry } from '@modules/geo-audit';

function page(url: string, archetype: AuditPageEntry['archetype'], geoScore: number): AuditPageEntry {
  return {
    url,
    source: 'sitemap',
    audited: false,
    archetype,
    geoScore,
  };
}

describe('groupPagesByArchetype', () => {
  it('groups pages under archetype labels in display order', () => {
    const groups = groupPagesByArchetype(
      [
        page('https://example.com/blog/a', 'blog', 40),
        page('https://example.com/', 'homepage', 95),
        page('https://example.com/pricing', 'product', 70),
        page('https://example.com/faq', 'faq', 88),
      ],
      'https://example.com',
    );
    expect(groups.map((g) => g.archetype)).toEqual(['homepage', 'faq', 'product', 'blog']);
    expect(groups.find((g) => g.archetype === 'product')?.pages).toHaveLength(1);
    expect(groups.find((g) => g.archetype === 'faq')?.pages[0]?.url).toContain('/faq');
  });

  it('places section root before nested paths in the same category', () => {
    const groups = groupPagesByArchetype(
      [
        page('https://example.com/product/widget-a', 'product', 90),
        page('https://example.com/product/widget-b', 'product', 85),
        page('https://example.com/product', 'product', 70),
        page('https://example.com/pricing', 'product', 95),
      ],
      'https://example.com',
    );
    const productUrls = groups.find((g) => g.archetype === 'product')?.pages.map((p) => p.url) ?? [];
    expect(productUrls[0]).toBe('https://example.com/product');
    expect(productUrls[1]).toMatch(/\/pricing$/);
    expect(productUrls[2]).toContain('/product/widget-a');
  });
});
