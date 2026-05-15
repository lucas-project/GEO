import { describe, expect, it } from 'vitest';
import {
  extractWebsiteFromText,
  isPlausibleWebsiteUrl,
  normalizeWebsiteUrl,
} from './website-url';

describe('normalizeWebsiteUrl', () => {
  it('adds https and strips trailing slash', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com');
    expect(normalizeWebsiteUrl('https://example.com/')).toBe('https://example.com');
  });

  it('preserves path', () => {
    expect(normalizeWebsiteUrl('https://example.com/about')).toBe('https://example.com/about');
  });
});

describe('extractWebsiteFromText', () => {
  it('extracts multi-part TLD domains', () => {
    expect(extractWebsiteFromText('Audit www.mdhome.com.au for GEO')).toBe('https://www.mdhome.com.au');
  });

  it('returns null for empty input', () => {
    expect(extractWebsiteFromText('')).toBeNull();
  });
});

describe('isPlausibleWebsiteUrl', () => {
  it('rejects bare www + single label', () => {
    expect(isPlausibleWebsiteUrl('www.mdhome')).toBe(false);
  });

  it('accepts real domains', () => {
    expect(isPlausibleWebsiteUrl('mdhome.com.au')).toBe(true);
  });
});
