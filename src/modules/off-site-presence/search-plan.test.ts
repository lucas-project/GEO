import { describe, expect, it } from 'vitest';
import { resolveHeuristicSearchPlan } from './search-plan';
import { buildQueryDefsFromPlan } from './search-supplement';
import type { BrandEntityResult } from './schemas';

function brand(overrides: Partial<BrandEntityResult> = {}): BrandEntityResult {
  return {
    primaryBrand: 'Ferrari',
    aliases: ['ferrari'],
    confidence: 1,
    needsReview: false,
    sources: ['override'],
    flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
    sameAsUrls: [],
    ...overrides,
  };
}

describe('resolveHeuristicSearchPlan', () => {
  it('skips G2 and Capterra for automotive brands', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand(),
      domain: 'ferrari.com',
      pages: [
        {
          url: 'https://ferrari.com',
          html: '<title>Ferrari — luxury automotive manufacturer</title>',
          schemas: [{ type: 'Organization', raw: { name: 'Ferrari' } }],
        },
      ],
    });
    expect(plan.category).toBe('automotive');
    expect(plan.probePlatforms).not.toContain('g2');
    expect(plan.probePlatforms).not.toContain('capterra');
    expect(plan.probePlatforms).toContain('reddit');
    expect(plan.skipPlatforms.map((s) => s.id)).toEqual(
      expect.arrayContaining(['g2', 'capterra']),
    );
  });

  it('classifies Ferrari as automotive even with cloud/platform page copy', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand(),
      domain: 'ferrari.com',
      pages: [
        {
          url: 'https://ferrari.com',
          html: '<title>Ferrari</title><p>Our cloud platform connects drivers worldwide.</p>',
          schemas: [],
        },
      ],
    });
    expect(plan.category).toBe('automotive');
    expect(plan.probePlatforms).not.toContain('g2');
  });

  it('classifies HVAC dealer sites as local_service and skips software review platforms', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand({ primaryBrand: 'MD Home', aliases: ['md home'] }),
      domain: 'mdhome.com.au',
      pages: [
        {
          url: 'https://mdhome.com.au',
          html: '<title>MD Home — Midea air conditioning dealer</title><h1>Split system installation</h1>',
          schemas: [],
        },
      ],
    });
    expect(plan.category).toBe('local_service');
    expect(plan.probePlatforms).not.toContain('g2');
    expect(plan.probePlatforms).not.toContain('trustpilot');
    expect(plan.skipPlatforms.map((s) => s.id)).toEqual(
      expect.arrayContaining(['g2', 'capterra', 'trustpilot']),
    );
  });

  it('includes G2 and Capterra for B2B SaaS signals', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand({ primaryBrand: 'Acme Analytics', aliases: ['acme analytics'] }),
      domain: 'acme.io',
      pages: [
        {
          url: 'https://acme.io',
          html: '<title>Acme Analytics — B2B SaaS software for teams</title>',
          schemas: [{ type: 'SoftwareApplication', raw: { name: 'Acme' } }],
        },
      ],
    });
    expect(plan.category).toBe('b2b_saas');
    expect(plan.probePlatforms).toContain('g2');
    expect(plan.probePlatforms).toContain('capterra');
  });
});

describe('buildQueryDefsFromPlan', () => {
  it('excludes G2 and Trustpilot queries for local_service plan', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand({ primaryBrand: 'MD Home' }),
      domain: 'mdhome.com.au',
      pages: [
        {
          url: 'https://mdhome.com.au',
          html: '<title>Midea air conditioning authorised dealer</title>',
        },
      ],
    });
    expect(plan.category).toBe('local_service');
    const keys = buildQueryDefsFromPlan('MD Home', 'mdhome.com.au', plan).map((d) => d.key);
    expect(keys).not.toContain('g2');
    expect(keys).not.toContain('capterra');
    expect(keys).not.toContain('trustpilot');
    expect(keys).toContain('news');
  });

  it('excludes G2 queries for automotive plan', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: brand(),
      domain: 'ferrari.com',
      pages: [{ url: 'https://ferrari.com', html: '<title>Ferrari automotive</title>' }],
    });
    const defs = buildQueryDefsFromPlan('Ferrari', 'ferrari.com', plan);
    const keys = defs.map((d) => d.key);
    expect(keys).toContain('reddit');
    expect(keys).toContain('general');
    expect(keys).not.toContain('g2');
    expect(keys).not.toContain('capterra');
  });
});
