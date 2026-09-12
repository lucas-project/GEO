import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import { enrichBrandEntityWithLlm } from './enrich-brand-entity';
import type { BrandEntityResult } from './schemas';

const mutableConfig = config as { ai: { provider: string } };
const originalProvider = mutableConfig.ai.provider;

const baseEntity: BrandEntityResult = {
  primaryBrand: 'Mdhome',
  aliases: ['Mdhome'],
  confidence: 0.35,
  needsReview: true,
  sources: ['domain-stem'],
  sameAsUrls: [],
  flags: { marketplaceMode: false, ambiguousGeneric: true, subBrands: [] },
};

describe('enrichBrandEntityWithLlm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mutableConfig.ai.provider = 'minimax';
  });

  afterEach(() => {
    mutableConfig.ai.provider = originalProvider;
  });

  it('replaces domain-stem brand with page-informed name and search terms', async () => {
    vi.spyOn(ai, 'generateStructuredOutput').mockResolvedValue({
      data: {
        primaryBrand: 'MD Home',
        aliases: ['MD Home Air Conditioning', 'Midea dealer'],
        businessSummary: 'Authorised Midea HVAC dealer in Australia.',
        searchTerms: ['Midea dealer', 'split system', 'heat pump', 'air conditioning installation'],
      },
      provider: 'minimax',
      model: 'test',
    } as never);

    const result = await enrichBrandEntityWithLlm({
      entity: baseEntity,
      domain: 'mdhome.com.au',
      pageContext: 'Title: MD Home | Midea Air Conditioning Dealer\nH1: Split systems and heat pumps',
    });

    expect(result?.entity.primaryBrand).toBe('MD Home');
    expect(result?.searchTerms).toContain('split system');
    expect(result?.entity.sources).toContain('llm-brand-enrich');
  });
});
