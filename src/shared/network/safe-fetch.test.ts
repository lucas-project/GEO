import { describe, expect, it } from 'vitest';
import { isPrivateAddress, UnsafeUrlError, validateSafeUrl } from './safe-fetch';

describe('safe fetch URL policy', () => {
  it('blocks loopback and private IPv4 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.0.0.4')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('192.0.0.9')).toBe(true);
    expect(isPrivateAddress('198.18.0.1')).toBe(true);
    expect(isPrivateAddress('198.51.100.9')).toBe(true);
    expect(isPrivateAddress('203.0.113.9')).toBe(true);
    expect(isPrivateAddress('2001:db8::1')).toBe(true);
    expect(isPrivateAddress('::ffff:198.51.100.9')).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('allows public HTTP(S) URLs and rejects unsafe protocols/ports', () => {
    expect(validateSafeUrl('https://example.com/path').hostname).toBe('example.com');
    expect(() => validateSafeUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
    expect(() => validateSafeUrl('http://example.com:8080')).toThrow(UnsafeUrlError);
    expect(() => validateSafeUrl('http://127.0.0.1')).toThrow(UnsafeUrlError);
  });
});
