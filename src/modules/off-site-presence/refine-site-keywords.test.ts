import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getSiteKeywordsAI, resetSiteKeywordsAIForTests } from '@shared/ai';
import { config } from '@shared/config';
import { refineSiteKeywordsWithModel } from './refine-site-keywords';

type MutableConfig = {
  ai: { provider: string };
  siteKeywords: { aiProvider: string };
  minimax: { apiKey: string };
};

const mutableConfig = config as unknown as MutableConfig;
const originalProvider = mutableConfig.ai.provider;
const originalSiteKeywordsProvider = mutableConfig.siteKeywords.aiProvider;
const originalMinimaxKey = mutableConfig.minimax.apiKey;

describe('refineSiteKeywordsWithModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSiteKeywordsAIForTests();
    mutableConfig.ai.provider = 'ollama';
    mutableConfig.siteKeywords.aiProvider = 'inherit';
  });

  afterEach(() => {
    resetSiteKeywordsAIForTests();
    mutableConfig.ai.provider = originalProvider;
    mutableConfig.siteKeywords.aiProvider = originalSiteKeywordsProvider;
    mutableConfig.minimax.apiKey = originalMinimaxKey;
  });

  it('drops error-code style terms via LLM refine', async () => {
    vi.spyOn(getSiteKeywordsAI(), 'generateStructuredOutput').mockResolvedValue({
      data: {
        keywords: [
          'split system',
          'air conditioning',
          'HVAC dealer',
          'heat pump',
          'Midea dealer',
        ],
      },
      provider: 'mock',
      model: 'test',
    } as never);

    const result = await refineSiteKeywordsWithModel({
      candidates: [
        'Error code list',
        'home',
        'split system',
        'air conditioning',
        'contact',
      ],
      title: 'MD Home — Midea air conditioning dealer',
      description: 'Authorised dealer for split systems',
      headings: ['Air conditioning installation'],
    });

    expect(result).not.toContain('Error code list');
    expect(result).not.toContain('home');
    expect(result).toContain('split system');
    expect(result).toContain('air conditioning');
  });

  it('uses minimax when SITE_KEYWORDS_AI_PROVIDER=minimax', async () => {
    mutableConfig.siteKeywords.aiProvider = 'minimax';
    mutableConfig.minimax.apiKey = 'test-key';

    const spy = vi.spyOn(getSiteKeywordsAI(), 'generateStructuredOutput').mockResolvedValue({
      data: {
        keywords: ['heat pump', 'Midea dealer', 'split system', 'air conditioning'],
      },
      provider: 'minimax',
      model: 'MiniMax-M2.5',
    } as never);

    const result = await refineSiteKeywordsWithModel({
      candidates: ['heat pump', 'Error code list', 'split system', 'air conditioning', 'contact'],
      title: 'MD Home',
      description: '',
      headings: [],
    });

    expect(spy).toHaveBeenCalled();
    expect(result).toContain('heat pump');
    expect(result).not.toContain('Error code list');
  });
});
