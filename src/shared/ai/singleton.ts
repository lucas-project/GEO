import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { createAIProvider } from './provider-factory';
import type { AIProvider } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __geoAI: AIProvider | undefined;
}

function pickProvider(): AIProvider {
  return createAIProvider(config.ai.provider);
}

export const ai: AIProvider = globalThis.__geoAI ?? pickProvider();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoAI = ai;
}

aiLogger.info({ provider: ai.name }, 'AI provider initialized');
