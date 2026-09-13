import { parseJson } from '@shared/database/client';

export interface AuditSampleScope {
  sampleManifest: string | null | undefined;
  scoreVersion: string | null | undefined;
}

export interface SampleComparison {
  comparable: boolean;
  reason: 'same_sample' | 'legacy_or_empty_sample' | 'score_version_changed' | 'sample_changed';
}

function normalizedManifest(value: string | null | undefined): string[] {
  const raw = parseJson<unknown>(value ?? '[]', []);
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((url): url is string => typeof url === 'string' && url.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

/** A score trend is meaningful only when its rules and observed URL set match. */
export function compareAuditSampleScopes(previous: AuditSampleScope, current: AuditSampleScope): SampleComparison {
  const previousSample = normalizedManifest(previous.sampleManifest);
  const currentSample = normalizedManifest(current.sampleManifest);
  if (previousSample.length === 0 || currentSample.length === 0) {
    return { comparable: false, reason: 'legacy_or_empty_sample' };
  }
  if (previous.scoreVersion !== current.scoreVersion) {
    return { comparable: false, reason: 'score_version_changed' };
  }
  if (previousSample.length !== currentSample.length || previousSample.some((url, i) => url !== currentSample[i])) {
    return { comparable: false, reason: 'sample_changed' };
  }
  return { comparable: true, reason: 'same_sample' };
}
