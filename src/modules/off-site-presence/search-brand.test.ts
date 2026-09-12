import { describe, expect, it } from 'vitest';
import { toSearchBrandLabel } from './search-brand';

describe('toSearchBrandLabel', () => {
  it('title-cases single lowercase brand tokens', () => {
    expect(toSearchBrandLabel('ferrari')).toBe('Ferrari');
    expect(toSearchBrandLabel('acme')).toBe('Acme');
  });

  it('leaves mixed-case brands unchanged', () => {
    expect(toSearchBrandLabel('Ferrari N.V.')).toBe('Ferrari N.V.');
  });
});
