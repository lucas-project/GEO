import { describe, expect, it } from 'vitest';
import { emptyPageChecklist } from './empty-checklist';
import { buildSiteProfile } from './site-profile';
import type { PageExtraction } from './schemas';

const page = (overrides: Partial<PageExtraction> = {}): PageExtraction => ({
  url: 'https://acme.com',
  metadata: {
    title: 'Acme HVAC | Home', description: null, canonical: null, ogTitle: null,
    ogSiteName: 'Acme HVAC', ogDescription: null, ogType: null, twitterCard: null,
    language: 'en-AU', charset: 'utf-8', robots: null,
  },
  headings: [],
  schemas: [{ type: 'Organization', raw: { name: 'Acme HVAC' } }, { type: 'Service', raw: { name: 'Air conditioning' } }],
  faqs: [], entities: [], chunks: [], links: [], tables: [], authors: [],
  checklist: emptyPageChecklist(),
  ...overrides,
});

describe('buildSiteProfile', () => {
  it('prefers Organization evidence and keeps the profile as a draft', () => {
    const result = buildSiteProfile({
      siteUrl: 'https://acme.com',
      pages: [{ pageUrl: 'https://acme.com', extraction: page() }],
    });
    expect(result.primaryEntity.name).toBe('Acme HVAC');
    expect(result.primaryEntity.role).toBe('service');
    expect(result.offerings).toEqual(['Air conditioning']);
    expect(result.confirmationState).toBe('draft');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('marks domain-only identity as needing review', () => {
    const result = buildSiteProfile({
      siteUrl: 'https://unknown.example',
      pages: [{ pageUrl: 'https://unknown.example', extraction: page({ metadata: { ...page().metadata, title: null, ogSiteName: null }, schemas: [] }) }],
    });
    expect(result.primaryEntity.name).toBe('unknown');
    expect(result.confirmationState).toBe('needs_review');
    expect(result.evidenceIds).toEqual([]);
  });
});
