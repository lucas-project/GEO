import { config } from '@shared/config';

/** Slightly capable but lightweight model for GEO content prompt lists. */
export function resolveGeoContentModel(providerName: string): string | undefined {
  switch (providerName) {
    case 'openai':
      return config.geoContent.openaiModel;
    case 'gemini':
      return config.geoContent.geminiModel;
    case 'ollama':
      return config.geoContent.ollamaModel;
    case 'anthropic':
      return config.geoContent.anthropicModel;
    case 'minimax':
      return config.geoContent.minimaxModel;
    default:
      return undefined;
  }
}
