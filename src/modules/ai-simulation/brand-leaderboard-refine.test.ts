import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/config', () => ({
  config: {
    ai: { provider: 'mock' },
    logging: { level: 'silent' },
  },
}));

vi.mock('@shared/ai', () => ({
  ai: { generateStructuredOutput: vi.fn() },
}));

import { refineBrandLeaderboard } from './brand-leaderboard-refine';
import type { SimulationRun } from './schemas';

function runWithMentions(mentions: string[]): SimulationRun[] {
  return [
    {
      id: '1',
      platform: 'chatgpt',
      responseText: mentions.join(' '),
      citations: [],
      brandMentions: mentions.map((brand) => ({ brand, count: 1 })),
      model: 'test',
      provider: 'test',
      executionMode: 'mock',
      tokens: { input: 0, output: 0, total: 0 },
    },
  ];
}

describe('refineBrandLeaderboard', () => {
  it('merges case variants and drops generic terms', async () => {
    const runs = runWithMentions([
      'Midea',
      'midea',
      'energy',
      'Midea Ducted System',
      'Samsung',
      'LG',
    ]);
    const result = await refineBrandLeaderboard(runs);
    const names = result.map((r) => r.brand.toLowerCase());
    expect(names).toContain('midea');
    expect(names).not.toContain('energy');
    expect(names).toContain('samsung');
    expect(result.find((r) => r.brand.toLowerCase() === 'midea')?.count).toBeGreaterThanOrEqual(2);
  });
});
