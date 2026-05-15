/**
 * Product / Organization schema generator.
 *
 * Heuristic-only (no LLM call); derives a Product JSON-LD block from the
 * extracted metadata + entities.
 */

import type { PageExtraction } from '@modules/extraction';

export function generateProductSchema(input: {
  url: string;
  siteName: string;
  extraction: PageExtraction;
}): { jsonLd: string; rationale: string } {
  const meta = input.extraction.metadata;
  const orgEntity = input.extraction.entities.find((e) => e.kind === 'organization');
  const productEntity = input.extraction.entities.find((e) => e.kind === 'product');

  if (productEntity) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': productEntity.name,
      'url': input.url,
      'description': meta.description ?? meta.ogDescription ?? '',
      'brand': orgEntity ? { '@type': 'Brand', 'name': orgEntity.name } : undefined,
    };
    return {
      jsonLd: JSON.stringify(schema, null, 2),
      rationale: `Generated Product JSON-LD for "${productEntity.name}" using extracted entities.`,
    };
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': orgEntity?.name ?? input.siteName,
    'url': new URL(input.url).origin,
    'description': meta.description ?? meta.ogDescription ?? '',
  };
  return {
    jsonLd: JSON.stringify(schema, null, 2),
    rationale: `Generated Organization JSON-LD using site metadata.`,
  };
}
