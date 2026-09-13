import { describe, expect, it } from 'vitest';
import { extractEntities } from './entities';

describe('extractEntities', () => {
  it('keeps JSON-LD entities with page evidence when model assistance is unavailable', async () => {
    const entities = await extractEntities({
      url: 'https://acme.example',
      title: 'Acme',
      bodyText: 'Acme Cooling provides installation and repair services for residential customers.',
      schemas: [
        { type: 'Organization', raw: { name: 'Acme Cooling' } },
        { type: 'Product', raw: { name: 'Acme Heat Pump' } },
      ],
    });

    expect(entities).toEqual([
      expect.objectContaining({ name: 'Acme Cooling', kind: 'organization', source: 'schema' }),
      expect.objectContaining({ name: 'Acme Heat Pump', kind: 'product', source: 'schema' }),
    ]);
    expect(entities.every((entity) => entity.evidence?.url === 'https://acme.example')).toBe(true);
  });

  it('does not emit mock brands when the active provider is mock', async () => {
    const entities = await extractEntities({
      url: 'https://example.com',
      title: 'Example Domain',
      bodyText: 'This domain is for use in illustrative examples in documents and demonstrations.',
    });

    expect(entities).toEqual([]);
  });
});
