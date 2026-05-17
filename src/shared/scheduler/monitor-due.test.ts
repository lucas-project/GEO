import { describe, expect, it } from 'vitest';
import {
  computeNextRunAt,
  computeFailureBackoffHours,
  computeAdaptiveIntervalHours,
  presetToHours,
} from './monitor-due';

describe('computeNextRunAt', () => {
  it('adds interval hours to the base time', () => {
    const base = new Date('2026-05-16T12:00:00.000Z');
    const next = computeNextRunAt(24, base);
    expect(next.toISOString()).toBe('2026-05-17T12:00:00.000Z');
  });

  it('supports sub-day intervals', () => {
    const base = new Date('2026-05-16T00:00:00.000Z');
    const next = computeNextRunAt(12, base);
    expect(next.toISOString()).toBe('2026-05-16T12:00:00.000Z');
  });
});

describe('monitor schedule presets', () => {
  it('maps presets to hours', () => {
    expect(presetToHours('12h')).toBe(12);
    expect(presetToHours('daily')).toBe(24);
    expect(presetToHours('weekly')).toBe(168);
  });
});

describe('computeAdaptiveIntervalHours', () => {
  it('shortens interval after multiple regressions', () => {
    const hours = computeAdaptiveIntervalHours({
      baseHours: 24,
      recentRegressionAlerts: 2,
      recentRuns: 4,
      monitorFailureCount: 0,
    });
    expect(hours).toBe(12);
  });

  it('lengthens interval when stable', () => {
    const hours = computeAdaptiveIntervalHours({
      baseHours: 24,
      recentRegressionAlerts: 0,
      recentRuns: 4,
      monitorFailureCount: 0,
    });
    expect(hours).toBe(36);
  });
});

describe('computeFailureBackoffHours', () => {
  it('grows with failure count and caps at max', () => {
    expect(computeFailureBackoffHours(1)).toBeGreaterThan(0);
    expect(computeFailureBackoffHours(3)).toBeGreaterThan(computeFailureBackoffHours(1));
    expect(computeFailureBackoffHours(20)).toBeLessThanOrEqual(72);
  });
});
