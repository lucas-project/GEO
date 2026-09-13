import type { z } from 'zod';
import { cache, type Cache } from '@shared/cache';
import type { AIProvider, GenerateStructuredInput, GenerateStructuredResult } from './types';

const flights = new WeakMap<Cache, Map<string, Promise<GenerateStructuredResult<unknown>>>>();

function stableHash(value: string): string {
  // FNV-1a keeps this shared helper browser-safe. Cache values are schema
  // validated on read, so a hypothetical collision cannot bypass validation.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cacheKey(provider: AIProvider, input: GenerateStructuredInput<z.ZodTypeAny>, namespace: string): string {
  const stable = JSON.stringify({
    namespace, provider: provider.name, model: input.model ?? null, schemaName: input.schemaName ?? null,
    system: input.system ?? null, prompt: input.prompt, temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
  });
  return `ai:structured:${stableHash(stable)}`;
}

/**
 * Opt-in cache for deterministic-enough structured assistance. The caller
 * controls TTL and namespace; scoring and acquisition facts never use it.
 */
export async function generateCachedStructuredOutput<TSchema extends z.ZodTypeAny>(
  provider: AIProvider,
  input: GenerateStructuredInput<TSchema>,
  options: { ttlSeconds: number; namespace: string; cacheStore?: Cache },
): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
  // Mock responses are free and often deliberately varied by tests; caching
  // them would hide call expectations without reducing operating cost.
  if (provider.name === 'mock') return provider.generateStructuredOutput(input);
  const store = options.cacheStore ?? cache;
  const key = cacheKey(provider, input, options.namespace);
  const cached = await store.get<GenerateStructuredResult<unknown>>(key);
  if (cached) {
    const parsed = input.schema.safeParse(cached.data);
    if (parsed.success) return { ...cached, data: parsed.data };
    await store.delete(key);
  }
  let pending = flights.get(store);
  if (!pending) { pending = new Map(); flights.set(store, pending); }
  let flight = pending.get(key);
  if (!flight) {
    flight = (async () => {
      const result = await provider.generateStructuredOutput(input);
      await store.set(key, result, options.ttlSeconds);
      return result;
    })();
    pending.set(key, flight);
  }
  try {
    const result = await flight;
    return { ...result, data: input.schema.parse(result.data) };
  } finally {
    if (pending.get(key) === flight) pending.delete(key);
  }
}
