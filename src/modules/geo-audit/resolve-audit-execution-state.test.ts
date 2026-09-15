import { describe, expect, it } from 'vitest';
import {
  applyExecutionStateToMeta,
  resolveAuditExecutionState,
  resolveDisplayedAuditStatus,
} from './resolve-audit-execution-state';
import type { ScoringMeta } from './schemas';

describe('resolveAuditExecutionState', () => {
  it('marks completed when the full sample is audited', () => {
    const state = resolveAuditExecutionState({
      maxPages: 5,
      auditedPages: 5,
      discoveredPages: 12,
    });
    expect(state.status).toBe('completed');
    expect(state.completion).toBe('complete');
    expect(state.sampleCoverageStatus).toBe('ready');
    expect(state.sampleCoverage).toBe(1);
  });

  it('marks partial when budget stops early', () => {
    const state = resolveAuditExecutionState({
      maxPages: 5,
      auditedPages: 4,
      discoveredPages: 20,
      stopReason: 'httpRequests',
    });
    expect(state.status).toBe('partial');
    expect(state.completion).toBe('partial');
    expect(state.stopReason).toBe('httpRequests');
    expect(state.sampleCoverageStatus).not.toBe('ready');
  });

  it('keeps a complete selected sample complete when discovery hits a budget', () => {
    const state = resolveAuditExecutionState({
      maxPages: 3,
      auditedPages: 3,
      discoveredPages: 12,
      stopReason: 'httpRequests',
    });
    expect(state.status).toBe('completed');
    expect(state.completion).toBe('complete');
    expect(state.sampleCoverageStatus).toBe('ready');
    expect(state.stopReason).toBe('httpRequests');
  });

  it('marks partial when sample is incomplete without budget stop', () => {
    const state = resolveAuditExecutionState({
      maxPages: 5,
      auditedPages: 2,
      discoveredPages: 10,
    });
    expect(state.status).toBe('partial');
    expect(state.completion).toBe('partial');
    expect(state.sampleCoverageStatus).toBe('partial');
  });

  it('marks failed when failed flag is set', () => {
    const state = resolveAuditExecutionState({
      maxPages: 3,
      auditedPages: 0,
      discoveredPages: 0,
      failed: true,
    });
    expect(state.status).toBe('failed');
    expect(state.completion).toBe('failed');
  });
});

describe('resolveDisplayedAuditStatus', () => {
  it('returns DB status when already partial or failed', () => {
    expect(resolveDisplayedAuditStatus('partial', null)).toBe('partial');
    expect(resolveDisplayedAuditStatus('failed', null)).toBe('failed');
    expect(resolveDisplayedAuditStatus('completed', null)).toBe('completed');
  });

  it('derives partial from legacy scoringMeta when DB says completed', () => {
    const meta = {
      completion: 'partial',
      stopReason: 'httpRequests',
    } as ScoringMeta;
    expect(resolveDisplayedAuditStatus('completed', meta)).toBe('partial');
  });

  it('derives partial from stopReason alone', () => {
    const meta = { stopReason: 'browserMs' } as ScoringMeta;
    expect(resolveDisplayedAuditStatus('completed', meta)).toBe('partial');
  });
});

describe('applyExecutionStateToMeta', () => {
  it('writes completion and sample fields onto scoringMeta', () => {
    const state = resolveAuditExecutionState({
      maxPages: 5,
      auditedPages: 4,
      discoveredPages: 8,
      stopReason: 'httpRequests',
    });
    const meta = applyExecutionStateToMeta({} as ScoringMeta, state);
    expect(meta.completion).toBe('partial');
    expect(meta.stopReason).toBe('httpRequests');
    expect(meta.auditedPages).toBe(4);
    expect(meta.requestedPages).toBe(5);
    expect(meta.sampleCoverageStatus).toBe('partial');
  });
});
