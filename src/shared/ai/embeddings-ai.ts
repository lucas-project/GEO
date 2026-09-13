import { config } from '@shared/config';
import { createAIProvider } from './provider-factory';
import { ai } from './singleton';
import { capabilityBoundProvider } from './capabilities';
import type { AIProvider } from './types';

let embeddingsProvider: AIProvider | null = null;
let embeddingsProviderKey = '';

/** Clears cached override provider (tests only). */
export function resetEmbeddingsAIForTests(): void {
  embeddingsProvider = null;
  embeddingsProviderKey = '';
}

/** Embeddings provider — may differ from chat when AI_PROVIDER=minimax (no embed API). */
export function getEmbeddingsAI(): AIProvider {
  const override = config.embeddings.aiProvider;
  if (!override || override === 'inherit') return ai;

  const cacheKey = override;
  if (embeddingsProvider && embeddingsProviderKey === cacheKey) {
    return embeddingsProvider;
  }

  embeddingsProvider = capabilityBoundProvider(createAIProvider(override), 'embeddings');
  embeddingsProviderKey = cacheKey;
  return embeddingsProvider;
}
