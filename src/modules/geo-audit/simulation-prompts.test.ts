import { describe, expect, it } from 'vitest';
import {
  applyGeneratedSimulationPrompts,
  collectUniquePromptEntries,
  expectedSimulationPromptCount,
  normalizeSimulationPrompts,
  resolveQuestionTypes,
  SIMULATION_PROMPTS_PER_TYPE,
} from './simulation-prompts';

describe('resolveQuestionTypes', () => {
  it('defaults to both types', () => {
    expect(resolveQuestionTypes()).toEqual(['brand', 'discovery']);
  });

  it('allows brand-only', () => {
    expect(resolveQuestionTypes({ brand: true, discovery: false })).toEqual(['brand']);
  });
});

describe('normalizeSimulationPrompts', () => {
  it('infers brand type when name appears in legacy string', () => {
    const out = normalizeSimulationPrompts(['What is Midea warranty?'], 'Midea');
    expect(out[0]?.type).toBe('brand');
  });

  it('infers discovery for generic legacy strings', () => {
    const out = normalizeSimulationPrompts(['Best split system AC for small apartments'], 'Midea');
    expect(out[0]?.type).toBe('discovery');
  });
});

describe('applyGeneratedSimulationPrompts', () => {
  it('keeps only the selected type and caps at 10', () => {
    const generated = Array.from({ length: 12 }, (_, i) => ({
      prompt: `Brand Q ${i}`,
      type: 'brand' as const,
    }));
    const applied = applyGeneratedSimulationPrompts(generated, ['brand']);
    expect(applied).toHaveLength(SIMULATION_PROMPTS_PER_TYPE);
    expect(applied.every((e) => e.type === 'brand')).toBe(true);
  });

  it('drops unselected types entirely', () => {
    const generated = [
      { prompt: 'New brand Q', type: 'brand' as const },
      { prompt: 'New discovery Q', type: 'discovery' as const },
    ];
    const applied = applyGeneratedSimulationPrompts(generated, ['brand']);
    expect(applied).toEqual([{ prompt: 'New brand Q', type: 'brand' }]);
  });

  it('allows up to 10 per type when both are selected', () => {
    const generated = [
      ...Array.from({ length: 10 }, (_, i) => ({
        prompt: `Brand ${i}`,
        type: 'brand' as const,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        prompt: `Discovery ${i}`,
        type: 'discovery' as const,
      })),
    ];
    const applied = applyGeneratedSimulationPrompts(generated, ['brand', 'discovery']);
    expect(applied).toHaveLength(20);
    expect(applied.filter((e) => e.type === 'brand')).toHaveLength(10);
    expect(applied.filter((e) => e.type === 'discovery')).toHaveLength(10);
  });
});

describe('expectedSimulationPromptCount', () => {
  it('returns 10 for one type and 20 for both', () => {
    expect(expectedSimulationPromptCount(['brand'])).toBe(10);
    expect(expectedSimulationPromptCount(['brand', 'discovery'])).toBe(20);
  });
});

describe('collectUniquePromptEntries', () => {
  it('dedupes and caps additions', () => {
    const seen = new Set<string>(['existing q']);
    const added = collectUniquePromptEntries(
      ['Existing Q', 'New one', 'New two', ''],
      'brand',
      seen,
      2,
    );
    expect(added).toEqual([
      { prompt: 'New one', type: 'brand' },
      { prompt: 'New two', type: 'brand' },
    ]);
    expect(seen.size).toBe(3);
  });
});
