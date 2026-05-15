import { describe, expect, it } from 'vitest';
import { isTerminalJobStatus } from './jobs';

describe('isTerminalJobStatus', () => {
  it('returns false for active states', () => {
    expect(isTerminalJobStatus('pending')).toBe(false);
    expect(isTerminalJobStatus('running')).toBe(false);
    expect(isTerminalJobStatus(undefined)).toBe(false);
  });

  it('returns true for terminal states', () => {
    expect(isTerminalJobStatus('completed')).toBe(true);
    expect(isTerminalJobStatus('failed')).toBe(true);
    expect(isTerminalJobStatus('cancelled')).toBe(true);
  });
});
