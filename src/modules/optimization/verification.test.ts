import { describe, expect, it } from 'vitest';
import { compareTargetCriteria } from './verification';

const evidence = (id: string, finalUrl: string) => ({
  id, requestedUrl: finalUrl, finalUrl, capturedAt: '2026-09-15T00:00:00.000Z', snapshotId: 'snap',
  method: 'browser' as const, status: 'observed' as const, extractorVersion: 'test',
});
const criterion = (outcome: 'pass' | 'fail') => ({
  criterionId: 'page.title_present', ruleVersion: 'test', scope: 'page' as const,
  applicability: 'applicable' as const, outcome, earned: outcome === 'pass' ? 1 : 0,
  possible: 1, confidence: 'high' as const, confidenceReason: 'test', evidenceIds: ['target'],
});

describe('compareTargetCriteria', () => {
  it('only verifies the artifact target page', () => {
    const result = compareTargetCriteria({
      before: { evidence: [evidence('target', 'https://example.test/service'), evidence('other', 'https://example.test/blog')], criteria: [criterion('fail')] },
      after: { evidence: [evidence('target', 'https://example.test/service'), evidence('other', 'https://example.test/blog')], criteria: [criterion('pass')] },
      targetUrl: 'https://example.test/service', rootUrl: 'https://example.test',
    });
    expect(result).toEqual([{ criterionId: 'page.title_present', before: 'fail', after: 'pass', state: 'resolved' }]);
  });
});
