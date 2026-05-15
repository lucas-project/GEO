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

import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { MockAIProvider } from './providers/mock';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';
import type { AIProvider } from './types';

export type * from './types';
export { AIProviderError } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __geoAI: AIProvider | undefined;
}

function pickProvider(): AIProvider {
  switch (config.ai.provider) {
    case 'openai':
      if (config.ai.openai.apiKey) return new OpenAIProvider();
      aiLogger.warn('AI_PROVIDER=openai but OPENAI_API_KEY missing; falling back to mock');
      return new MockAIProvider();
    case 'anthropic':
      if (config.ai.anthropic.apiKey) return new AnthropicProvider();
      aiLogger.warn('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY missing; falling back to mock');
      return new MockAIProvider();
    case 'gemini':
      if (config.ai.gemini.apiKey) return new GeminiProvider();
      aiLogger.warn('AI_PROVIDER=gemini but GOOGLE_API_KEY missing; falling back to mock');
      return new MockAIProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'mock':
    default:
      return new MockAIProvider();
  }
}

export const ai: AIProvider = globalThis.__geoAI ?? pickProvider();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoAI = ai;
}

aiLogger.info({ provider: ai.name }, 'AI provider initialized');

export { MockAIProvider } from './providers/mock';
export { mockSampleBrands, mockSampleDomains } from './providers/mock';
export { OllamaProvider } from './providers/ollama';
