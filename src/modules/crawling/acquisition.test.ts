import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_REASON_CODES,
  assertSafeUserFacingCopy,
  classifyNavigationError,
  copyForReasonCode,
  detailForObserved,
  resolveAcquisitionCopy,
} from './acquisition';

describe('acquisition classification', () => {
  it('maps every reasonCode to safe userMessage/nextAction', () => {
    for (const code of ACQUISITION_REASON_CODES) {
      const copy = copyForReasonCode(code);
      expect(copy.userMessage.length).toBeGreaterThan(8);
      expect(copy.nextAction.length).toBeGreaterThan(2);
      expect(assertSafeUserFacingCopy(copy.userMessage)).toBe(true);
      expect(assertSafeUserFacingCopy(copy.nextAction)).toBe(true);
      expect(copy.badge).not.toMatch(/legacy_unknown|ERR_FAILED|domcontentloaded/i);
    }
  });

  it('classifies timeout with Daikin-style copy', () => {
    const result = classifyNavigationError(
      new Error('page.goto: Timeout 30000ms exceeded. waiting until "domcontentloaded"'),
    );
    expect(result.fetchStatus).toBe('timeout');
    expect(result.reasonCode).toBe('nav_timeout');
    expect(result.userMessage).toContain('may work normally for visitors');
    expect(result.userMessage).toContain('excluded from the score');
    expect(assertSafeUserFacingCopy(result.userMessage)).toBe(true);
    expect(result.technicalMessage).toMatch(/domcontentloaded|Timeout/i);
  });

  it('classifies WAF-ish rate limit and DNS/TLS', () => {
    expect(classifyNavigationError(new Error('HTTP 429 Too Many Requests')).reasonCode).toBe(
      'rate_limited',
    );
    expect(classifyNavigationError(new Error('net::ERR_NAME_NOT_RESOLVED')).reasonCode).toBe(
      'dns_or_tls',
    );
    expect(classifyNavigationError(new Error('net::ERR_CERT_AUTHORITY_INVALID')).reasonCode).toBe(
      'dns_or_tls',
    );
    expect(classifyNavigationError(new Error('read ECONNRESET')).reasonCode).toBe('connection_reset');
    expect(classifyNavigationError(new Error('Navigation aborted')).reasonCode).toBe('nav_aborted');
    expect(classifyNavigationError(new Error('Invalid HTML charset parse')).reasonCode).toBe(
      'parse_failed',
    );
  });

  it('keeps bare ERR_FAILED out of primary UI copy', () => {
    const result = classifyNavigationError(new Error('net::ERR_FAILED'));
    expect(result.reasonCode).toBe('err_failed_unclassified');
    expect(result.fetchStatus).toBe('unreachable');
    expect(result.userMessage).not.toMatch(/ERR_FAILED/);
    expect(result.technicalMessage).toContain('ERR_FAILED');
  });

  it('never surfaces legacy_unknown as primary copy', () => {
    const copy = resolveAcquisitionCopy({ observationStatus: 'legacy_unknown' });
    expect(copy.badge).toBe('Re-crawl required');
    expect(copy.userMessage).not.toMatch(/legacy_unknown/i);
    expect(assertSafeUserFacingCopy(copy.userMessage)).toBe(true);
  });

  it('marks HTTP partial observation distinctly', () => {
    const detail = detailForObserved({
      elapsedMs: 120,
      fetchChannel: 'http',
      browserRenderComplete: false,
      httpStatus: 200,
      finalUrl: 'https://example.test/',
    });
    expect(detail.reasonCode).toBe('http_partial_observed');
    expect(detail.userMessage).toContain('HTTP');
    expect(detail.browserRenderComplete).toBe(false);
  });
});
