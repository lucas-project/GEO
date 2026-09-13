/**
 * AI singleton — entry point for every LLM call in the system.
 *
 * Usage:
 *   import { ai } from '@shared/ai';
 *   const { text } = await ai.generateText({ prompt: '...' });
 *   const { data } = await ai.generateStructuredOutput({ prompt: '...', schema: MySchema });
 *
 * The active provider is selected via AI_PROVIDER env var. Defaults to "mock"
 * so the platform boots end-to-end with zero keys.
 *
 * A `MultiProvider` (for AI Simulation Engine) lives in ./multi.
 */

export type * from './types';
export { AIProviderError } from './types';

export { ai } from './singleton';
export { generateCachedStructuredOutput } from './cached-structured-output';

export { MockAIProvider } from './providers/mock';
export { mockSampleBrands, mockSampleDomains } from './providers/mock';
export { OllamaProvider } from './providers/ollama';
export { MinimaxProvider } from './providers/minimax';
export { createAIProvider } from './provider-factory';
export {
  allowsCapability,
  isFreeDeterministicMode,
  getCapabilityAvailability,
  assertCapabilityAvailable,
  capabilityBoundProvider,
  CapabilityUnavailableError,
} from './capabilities';
export type { RuntimeCapability, CapabilityAvailability, CapabilityUnavailableReason } from './capabilities';
export {
  getSiteKeywordsAI,
  resolvedSiteKeywordsProviderName,
  resetSiteKeywordsAIForTests,
} from './site-keywords-ai';
export {
  getEmbeddingsAI,
  resetEmbeddingsAIForTests,
} from './embeddings-ai';
