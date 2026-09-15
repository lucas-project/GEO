import { describe, expect, it } from 'vitest';
import { canReadPage, currentObservations } from './current-observations';

describe('current observation policy', () => {
  it('keeps the latest canonical page once without discarding history', () => {
    const history = [
      { url: 'https://www.example.com/support', observationStatus: 'unreachable', attempt: 1 },
      { url: 'https://example.com/support/', observationStatus: 'observed', attempt: 2 },
    ];
    const current = currentObservations(history, 'https://example.com');
    expect(current).toHaveLength(1);
    expect(current[0]?.attempt).toBe(2);
    expect(history).toHaveLength(2);
    expect(canReadPage(history[0]!)).toBe(true);
    expect(canReadPage(current[0]!)).toBe(false);
  });
  it('permits failed attempts even if an older row was marked audited', () => {
    for (const observationStatus of ['blocked', 'unreachable', 'timeout', 'rate_limited', 'parse_error', 'legacy_unknown', 'not_run']) {
      expect(canReadPage({ observationStatus, audited: true })).toBe(true);
    }
    expect(canReadPage({ observationStatus: 'observed', audited: true })).toBe(false);
  });
});
