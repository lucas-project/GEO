import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { telemetry } from '@shared/telemetry';
import { createAIProvider } from './provider-factory';
import type { AIProvider } from './types';

declare global {
  var __geoAI: AIProvider | undefined;
}

function pickProvider(): AIProvider {
  const provider = createAIProvider(config.ai.provider);
  return {
    name: provider.name,
    async generateText(input) {
      const result = await provider.generateText(input);
      recordUsage('text', result.provider, result.model, result.tokens.total);
      return result;
    },
    async generateStructuredOutput(input) {
      const result = await provider.generateStructuredOutput(input);
      recordUsage('structured', result.provider, result.model, result.tokens.total);
      return result;
    },
    async generateEmbedding(input) {
      const result = await provider.generateEmbedding(input);
      recordUsage('embedding', result.provider, result.model, result.tokens.total);
      return result;
    },
  };
}

function recordUsage(kind: string, provider: string, model: string, tokens: number): void {
  const attrs = { kind, provider, model };
  telemetry.increment('ai.requests', 1, attrs);
  telemetry.increment('ai.tokens', Number.isFinite(tokens) ? tokens : 0, attrs);
}

export const ai: AIProvider = globalThis.__geoAI ?? pickProvider();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoAI = ai;
}

aiLogger.info({ provider: ai.name }, 'AI provider initialized');
