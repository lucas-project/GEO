import { config } from '@shared/config';

/** Capable model for presence search plan and curation. */
export function resolvePresenceModel(providerName: string): string | undefined {
  switch (providerName) {
    case 'openai':
      return config.ai.openai.model;
    case 'gemini':
      return config.ai.gemini.model;
    case 'ollama':
      return config.presenceProbe.ollamaModel;
    case 'anthropic':
      return config.ai.anthropic.model;
    case 'minimax':
      return config.presenceProbe.minimaxModel;
    default:
      return undefined;
  }
}

/** Model for on-page keyword refinement (may use SITE_KEYWORDS_AI_PROVIDER). */
export function resolveSiteKeywordsModel(providerName: string): string | undefined {
  switch (providerName) {
    case 'openai':
      return config.ai.openai.model;
    case 'gemini':
      return config.ai.gemini.model;
    case 'ollama':
      return config.siteKeywords.ollamaModel;
    case 'anthropic':
      return config.ai.anthropic.model;
    case 'minimax':
      return config.siteKeywords.minimaxModel;
    default:
      return undefined;
  }
}
