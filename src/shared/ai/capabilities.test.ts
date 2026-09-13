import { describe, expect, it, vi } from 'vitest';
import {
  allowsCapability,
  capabilityBoundProvider,
  CapabilityUnavailableError,
  getCapabilityAvailability,
  isFreeDeterministicMode,
} from './capabilities';
import type { AIProvider } from './types';

describe('runtime capabilities', () => {
  it('defaults to a zero-cost deterministic mode', () => {
    expect(isFreeDeterministicMode()).toBe(true);
    expect(allowsCapability('remote_ai')).toBe(false);
    expect(allowsCapability('remote_search')).toBe(false);
    expect(allowsCapability('embeddings')).toBe(false);
    expect(getCapabilityAvailability('simulation')).toMatchObject({
      available: false,
      reason: 'mode_disabled',
    });
  });

  it('stops provider work before a disabled capability reaches the provider', async () => {
    const generateText = vi.fn();
    const provider = { name: 'mock', generateText } as unknown as AIProvider;
    const guarded = capabilityBoundProvider(provider, 'remote_ai');

    await expect(guarded.generateText({ prompt: 'Should not run' })).rejects.toBeInstanceOf(
      CapabilityUnavailableError,
    );
    expect(generateText).not.toHaveBeenCalled();
  });
});
