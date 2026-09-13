import { describe, expect, it } from 'vitest';
import { compareAuditSampleScopes } from './sample-comparison';

describe('audit sample comparison', () => {
  it('accepts equal manifests regardless of storage order', () => {
    expect(compareAuditSampleScopes(
      { sampleManifest: '["https://example.test/","https://example.test/docs"]', scoreVersion: 'content-readiness-v3' },
      { sampleManifest: '["https://example.test/docs","https://example.test/"]', scoreVersion: 'content-readiness-v3' },
    )).toEqual({ comparable: true, reason: 'same_sample' });
  });

  it('rejects a health-check subset against a full baseline', () => {
    expect(compareAuditSampleScopes(
      { sampleManifest: '["https://example.test/","https://example.test/docs"]', scoreVersion: 'content-readiness-v3' },
      { sampleManifest: '["https://example.test/"]', scoreVersion: 'content-readiness-v3' },
    )).toEqual({ comparable: false, reason: 'sample_changed' });
  });

  it('rejects reports calculated with different scoring rules', () => {
    expect(compareAuditSampleScopes(
      { sampleManifest: '["https://example.test/"]', scoreVersion: 'hierarchical-v2' },
      { sampleManifest: '["https://example.test/"]', scoreVersion: 'content-readiness-v3' },
    )).toEqual({ comparable: false, reason: 'score_version_changed' });
  });
});
