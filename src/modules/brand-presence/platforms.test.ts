import { describe, expect, it } from 'vitest';
import { matchPlatformUrl } from './platforms';

describe('matchPlatformUrl', () => {
  it('matches G2 product URLs', () => {
    expect(matchPlatformUrl('https://www.g2.com/products/acme')?.platform).toBe('g2');
  });

  it('matches LinkedIn company without strict path-only company segment', () => {
    expect(matchPlatformUrl('https://www.linkedin.com/company/acme-corp')?.platform).toBe(
      'linkedin',
    );
  });

  it('matches Trustpilot review pages', () => {
    expect(
      matchPlatformUrl('https://www.trustpilot.com/review/example.com')?.platform,
    ).toBe('trustpilot');
  });

  it('matches YouTube channel handles', () => {
    expect(matchPlatformUrl('https://www.youtube.com/@acme')?.platform).toBe('youtube');
  });

  it('matches GitHub org profile', () => {
    expect(matchPlatformUrl('https://github.com/acme')?.platform).toBe('github');
  });

  it('matches Facebook page', () => {
    expect(matchPlatformUrl('https://www.facebook.com/acme')?.platform).toBe('facebook');
  });
});
