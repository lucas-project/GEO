import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateCachedStructuredOutput } from './cached-structured-output';
import type { AIProvider } from './types';
import type { Cache } from '@shared/cache';

function memoryStore() {
  const values = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string) => (values.get(key) as T | undefined) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); }),
    has: vi.fn(async (key: string) => values.has(key)),
  };
}

describe('cached structured output', () => {
  it('reuses a schema-valid response for identical explicit cache inputs', async () => {
    const provider = {
      name: 'fixture',
      generateStructuredOutput: vi.fn().mockResolvedValue({ data: { answer: 'ok' }, tokens: { input: 1, output: 1, total: 2 }, model: 'fixture', provider: 'fixture' }),
    } as unknown as AIProvider;
    const store = memoryStore();
    const cacheStore = store as unknown as Cache;
    const input = { prompt: 'same', schema: z.object({ answer: z.string() }), schemaName: 'Fixture', temperature: 0 };
    await generateCachedStructuredOutput(provider, input, { ttlSeconds: 60, namespace: 'test', cacheStore });
    await generateCachedStructuredOutput(provider, input, { ttlSeconds: 60, namespace: 'test', cacheStore });
    expect(provider.generateStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it('evicts an invalid cached payload and regenerates it', async () => {
    const provider = {
      name: 'fixture',
      generateStructuredOutput: vi.fn().mockResolvedValue({ data: { answer: 'fresh' }, tokens: { input: 1, output: 1, total: 2 }, model: 'fixture', provider: 'fixture' }),
    } as unknown as AIProvider;
    const store = memoryStore();
    const cacheStore = store as unknown as Cache;
    const schema = z.object({ answer: z.string() });
    const input = { prompt: 'invalid', schema, schemaName: 'Fixture' };
    await generateCachedStructuredOutput(provider, input, { ttlSeconds: 60, namespace: 'test', cacheStore });
    const key = store.set.mock.calls[0]?.[0] as string;
    await store.set(key, { data: { answer: 5 }, tokens: { input: 0, output: 0, total: 0 }, model: 'fixture', provider: 'fixture' });
    await generateCachedStructuredOutput(provider, input, { ttlSeconds: 60, namespace: 'test', cacheStore });
    expect(provider.generateStructuredOutput).toHaveBeenCalledTimes(2);
    expect(store.delete).toHaveBeenCalledWith(key);
  });
});
