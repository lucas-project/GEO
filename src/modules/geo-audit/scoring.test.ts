import { describe, expect, it } from 'vitest';
import { DIMENSIONS } from './schemas';

describe('geo-audit scoring dimensions', () => {
  it('defines exactly 10 blueprint dimensions', () => {
    expect(DIMENSIONS).toHaveLength(10);
    expect(new Set(DIMENSIONS).size).toBe(10);
  });
});
