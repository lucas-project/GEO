import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import {
  resolveProbeSetup,
  shouldUseBatchedProbeSetup,
} from './probe-setup-llm';
import type { BrandEntityResult } from './schemas';

type MutableConfig = {
  ai: { provider: string };
  siteKeywords: { aiProvider: string };
  presenceProbe: { searchPlanEnabled: boolean };
};

const mutableConfig = config as unknown as MutableConfig;
const originalProvider = mutableConfig.ai.provider;
const originalSiteKeywordsProvider = mutableConfig.siteKeywords.aiProvider;
const originalSearchPlanEnabled = mutableConfig.presenceProbe.searchPlanEnabled;

const baseEntity: BrandEntityResult = {
  primaryBrand: 'MD Home',
  aliases: ['Midea'],
  sameAsUrls: [],
  confidence: 0.6,
  needsReview: true,
  sources: ['domain-stem'],
  flags: {
    marketplaceMode: false,
    ambiguousGeneric: false,
    subBrands: [],
  },
};

describe('shouldUseBatchedProbeSetup', () => {
  beforeEach(() => {
    mutableConfig.ai.provider = 'ollama';
    mutableConfig.siteKeywords.aiProvider = 'inherit';
    mutableConfig.presenceProbe.searchPlanEnabled = true;
  });

  afterEach(() => {
    mutableConfig.ai.provider = originalProvider;
    mutableConfig.siteKeywords.aiProvider = originalSiteKeywordsProvider;
    mutableConfig.presenceProbe.searchPlanEnabled = originalSearchPlanEnabled;
  });

  it('returns false when search plan LLM is disabled', () => {
    mutableConfig.presenceProbe.searchPlanEnabled = false;
    expect(shouldUseBatchedProbeSetup()).toBe(false);
  });

  it('returns false when site keywords use a different provider', () => {
    mutableConfig.siteKeywords.aiProvider = 'minimax';
    expect(shouldUseBatchedProbeSetup()).toBe(false);
  });

  it('returns true when same provider and search plan enabled', () => {
    expect(shouldUseBatchedProbeSetup()).toBe(true);
  });
});

describe('resolveProbeSetup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mutableConfig.ai.provider = 'ollama';
    mutableConfig.siteKeywords.aiProvider = 'inherit';
    mutableConfig.presenceProbe.searchPlanEnabled = true;
  });

  afterEach(() => {
    mutableConfig.ai.provider = originalProvider;
    mutableConfig.siteKeywords.aiProvider = originalSiteKeywordsProvider;
    mutableConfig.presenceProbe.searchPlanEnabled = originalSearchPlanEnabled;
  });

  it('uses one LLM call for brand, keywords, and search plan', async () => {
    const spy = vi.spyOn(ai, 'generateStructuredOutput').mockResolvedValue({
      data: {
        primaryBrand: 'MD Home Air',
        aliases: ['Midea dealer'],
        businessSummary: 'HVAC dealer',
        category: 'local_service',
        rationale: 'Local installer',
        probePlatforms: ['reddit', 'site_search'],
        searchTargets: ['reddit', 'general', 'news'],
        skipPlatforms: [{ id: 'g2', reason: 'Not SaaS' }],
        customQueries: [],
        brandKeywords: ['split system', 'air conditioning', 'HVAC dealer'],
        additionalSources: [],
      },
      provider: 'mock',
      model: 'test',
    } as never);

    const result = await resolveProbeSetup({
      entity: baseEntity,
      domain: 'mdhome.com.au',
      pages: [],
      pageContext: 'MD Home sells Midea split systems in Sydney',
      prefetchedKeywords: ['heat pump'],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.batched).toBe(true);
    expect(result.entity.primaryBrand).toBe('MD Home Air');
    expect(result.siteKeywords).toContain('split system');
    expect(result.searchPlan.category).toBe('local_service');
    expect(result.searchPlan.source).toBe('llm');
  });

  it('falls back to heuristic without LLM when batching disabled', async () => {
    mutableConfig.presenceProbe.searchPlanEnabled = false;
    const spy = vi.spyOn(ai, 'generateStructuredOutput');

    const result = await resolveProbeSetup({
      entity: baseEntity,
      domain: 'mdhome.com.au',
      pages: [],
      pageContext: 'content',
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.batched).toBe(false);
    expect(result.searchPlan.source).toBe('heuristic');
  });
});
