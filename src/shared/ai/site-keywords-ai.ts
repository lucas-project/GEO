import { config } from '@shared/config';
import { createAIProvider } from './provider-factory';
import { ai } from './singleton';
import type { AIProvider } from './types';

let siteKeywordsProvider: AIProvider | null = null;
let siteKeywordsProviderKey = '';

/** Clears cached override provider (tests only). */
export function resetSiteKeywordsAIForTests(): void {
  siteKeywordsProvider = null;
  siteKeywordsProviderKey = '';
}

/** AI used to refine on-page keywords for presence search (can differ from AI_PROVIDER). */
export function getSiteKeywordsAI(): AIProvider {
  const override = config.siteKeywords.aiProvider;
  if (!override || override === 'inherit') return ai;

  const cacheKey = `${override}:${config.minimax.apiKey ? '1' : '0'}`;
  if (siteKeywordsProvider && siteKeywordsProviderKey === cacheKey) {
    return siteKeywordsProvider;
  }

  siteKeywordsProvider = createAIProvider(override);
  siteKeywordsProviderKey = cacheKey;
  return siteKeywordsProvider;
}

export function resolvedSiteKeywordsProviderName(): string {
  const override = config.siteKeywords.aiProvider;
  if (!override || override === 'inherit') return config.ai.provider;
  return override;
}
