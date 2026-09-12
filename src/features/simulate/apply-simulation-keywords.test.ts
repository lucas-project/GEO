import { describe, expect, it } from 'vitest';
import { applySimulationKeywords } from './apply-simulation-keywords';

describe('applySimulationKeywords', () => {
  it('returns prompt unchanged when no keywords', () => {
    expect(applySimulationKeywords('Best HVAC brands', [])).toBe('Best HVAC brands');
  });

  it('appends focus terms when not already present', () => {
    expect(applySimulationKeywords('Best HVAC brands', ['split system', 'Midea'])).toBe(
      'Best HVAC brands\n\n(Relevant products/topics: split system, Midea)',
    );
  });

  it('skips append when keyword already in prompt', () => {
    expect(applySimulationKeywords('Best Midea split system', ['Midea'])).toBe(
      'Best Midea split system',
    );
  });
});
