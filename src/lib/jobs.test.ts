import { describe, expect, it } from 'vitest';
import { isInterruptedJobError, isTerminalJobStatus } from './jobs';

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

describe('isInterruptedJobError', () => {
  it('detects worker restart message', () => {
    expect(isInterruptedJobError('Interrupted — worker stopped or restarted')).toBe(true);
    expect(isInterruptedJobError('network error')).toBe(false);
    expect(isInterruptedJobError(undefined)).toBe(false);
  });
});
