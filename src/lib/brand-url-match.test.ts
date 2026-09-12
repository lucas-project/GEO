import { describe, expect, it } from 'vitest';
import { brandMatchesUrl, brandMismatchMessage } from './brand-url-match';

describe('brand-url-match', () => {
  it('matches brand to hostname stem', () => {
    expect(brandMatchesUrl('Ferrari', 'https://www.ferrari.com')).toBe(true);
  });

  it('flags unrelated brand', () => {
    expect(brandMatchesUrl('mdhome', 'https://www.ferrari.com')).toBe(false);
    expect(brandMismatchMessage('mdhome', 'https://ferrari.com')).toContain('mdhome');
  });
});
