import { config } from '@shared/config';
import { currentTaskBudget } from './budget';
import type { AIProvider } from './types';

/** All factory providers share the same mode gate and token reservation. */
export function meteredProvider(provider: AIProvider): AIProvider {
  const call = async <T extends { tokens: { total: number } }>(input: { prompt?: string; text?: string; system?: string; maxTokens?: number }, work: () => Promise<T>) => {
    const mode = config.runtime?.mode;
    const remote = !['mock', 'ollama'].includes(provider.name);
    if (remote && mode && mode !== 'paid-assisted') throw new Error('Remote AI is unavailable in this run mode.');
    const budget = currentTaskBudget();
    const reserved = Math.ceil(((input.prompt ?? input.text ?? '') + (input.system ?? '')).length / 2) + (input.maxTokens ?? 2048);
    budget?.consume('tokens', reserved);
    const result = await work();
    if (budget) budget.used.tokens = Math.max(0, budget.used.tokens - reserved + result.tokens.total);
    return result;
  };
  return { name: provider.name,
    generateText: input => call(input, () => provider.generateText(input)),
    generateStructuredOutput: input => call(input, () => provider.generateStructuredOutput(input)),
    generateEmbedding: input => call(input, () => provider.generateEmbedding(input)),
  };
}
