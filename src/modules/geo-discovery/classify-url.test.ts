import { describe, expect, it } from 'vitest';
import { classifyUrl } from './classify-url';

describe('classifyUrl', () => {
  it('detects FAQ paths', () => {
    expect(classifyUrl('https://example.com/faq')).toBe('faq');
    expect(classifyUrl('https://example.com/help/contact', ['FAQ'])).toBe('faq');
  });

  it('detects documentation paths', () => {
    expect(classifyUrl('https://example.com/docs/getting-started')).toBe('documentation');
    expect(classifyUrl('https://example.com/guides/install')).toBe('documentation');
  });

  it('detects comparison paths', () => {
    expect(classifyUrl('https://example.com/vs/competitor')).toBe('comparison');
    expect(classifyUrl('https://example.com/compare/plans')).toBe('comparison');
  });

  it('excludes utility paths', () => {
    expect(classifyUrl('https://example.com/cart')).toBe('utility');
    expect(classifyUrl('https://example.com/login')).toBe('utility');
  });

  it('returns homepage for root', () => {
    expect(classifyUrl('https://example.com/')).toBe('homepage');
  });
});
