import { describe, expect, it } from 'vitest';
import { allowsCapability, isFreeDeterministicMode } from './capabilities';

describe('runtime capabilities', () => {
  it('defaults to a zero-cost deterministic mode', () => {
    expect(isFreeDeterministicMode()).toBe(true);
    expect(allowsCapability('remote_ai')).toBe(false);
    expect(allowsCapability('remote_search')).toBe(false);
    expect(allowsCapability('embeddings')).toBe(false);
  });
});
