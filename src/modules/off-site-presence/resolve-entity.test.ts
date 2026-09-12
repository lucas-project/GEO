import { describe, expect, it } from 'vitest';
import { resolveBrandEntity } from './resolve-entity';

describe('resolveBrandEntity', () => {
  it('uses og:site_name with high confidence', () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:site_name" content="Acme Corp" />
      <title>Products | Acme Corp</title>
    </head><body><footer>© 2024 Acme Corp</footer></body></html>`;

    const entity = resolveBrandEntity({
      siteUrl: 'https://acme.com',
      pages: [{ url: 'https://acme.com', html }],
    });

    expect(entity.primaryBrand).toBe('Acme Corp');
    expect(entity.confidence).toBeGreaterThanOrEqual(0.8);
    expect(entity.needsReview).toBe(false);
    expect(entity.aliases).toContain('Acme Corp');
  });

  it('respects brand override', () => {
    const entity = resolveBrandEntity({
      siteUrl: 'https://example.com',
      pages: [],
      brandOverride: 'Custom Brand',
    });
    expect(entity.primaryBrand).toBe('Custom Brand');
    expect(entity.confidence).toBe(1);
  });

  it('flags ambiguous short brands', () => {
    const html = `<!DOCTYPE html><html><head><title>Apple</title></head>
      <body><h1>Fresh fruit recipes</h1></body></html>`;
    const entity = resolveBrandEntity({
      siteUrl: 'https://apple.example',
      pages: [{ url: 'https://apple.example', html }],
    });
    expect(entity.flags.ambiguousGeneric).toBe(true);
  });
});
