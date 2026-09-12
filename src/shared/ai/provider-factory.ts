import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { MinimaxProvider } from './providers/minimax';
import { MockAIProvider } from './providers/mock';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import type { AIProvider } from './types';

export type NamedAIProvider = typeof config.ai.provider;

export function createAIProvider(name: NamedAIProvider): AIProvider {
  switch (name) {
    case 'openai':
      if (config.ai.openai.apiKey) return new OpenAIProvider();
      aiLogger.warn('openai provider requested but OPENAI_API_KEY missing; using mock');
      return new MockAIProvider();
    case 'anthropic':
      if (config.ai.anthropic.apiKey) return new AnthropicProvider();
      aiLogger.warn('anthropic provider requested but ANTHROPIC_API_KEY missing; using mock');
      return new MockAIProvider();
    case 'gemini':
      if (config.ai.gemini.apiKey) return new GeminiProvider();
      aiLogger.warn('gemini provider requested but GOOGLE_API_KEY missing; using mock');
      return new MockAIProvider();
    case 'minimax':
      if (config.minimax.apiKey) return new MinimaxProvider();
      aiLogger.warn('minimax provider requested but MINIMAX_API_KEY missing; using mock');
      return new MockAIProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'mock':
    default:
      return new MockAIProvider();
  }
}
