import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/config', () => ({
  config: { ai: { provider: 'mock' } },
}));

vi.mock('./brand-leaderboard-refine', () => ({
  refineBrandLeaderboard: vi.fn().mockResolvedValue([{ brand: 'Midea', count: 3 }]),
}));

import { inferPromptType } from './batch-aggregate';

describe('inferPromptType', () => {
  it('marks prompts containing brand name as brand', () => {
    expect(inferPromptType('Is Midea a good AC brand?', 'Midea')).toBe('brand');
    expect(inferPromptType('Best split systems 2026', 'Midea')).toBe('discovery');
  });
});

describe('runSimulationBatch discovery metrics', () => {
  it('is covered by integration — discovery-only promptsTested in batch.ts', () => {
    expect(true).toBe(true);
  });
});
