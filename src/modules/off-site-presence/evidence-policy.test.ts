import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { enforcePresenceEvidence, hasVerifiedProfile } from './evidence-policy';
import { toJson } from './report';
import type { OffSitePresenceReport, PlatformProbeResult } from './schemas';

describe('presence acquisition evidence', () => {
  const report = JSON.parse(readFileSync('docs/acceptance-2026-09-14/presence-export.json', 'utf8')) as OffSitePresenceReport;
  it('repairs the actual misleading legacy export on read', () => {
    const safe = enforcePresenceEvidence(report);
    expect(safe.scores.total).toBeNull();
    expect(safe.insights).toBeUndefined();
    expect(Object.values(safe.platforms).some(p => p.signals.profileExists)).toBe(false);
    const exported = JSON.parse(toJson(report));
    expect(exported.scores).toMatchObject({ total: null, media: null, reviews: null, community: null });
    expect(exported.serperBoost).toBeUndefined();
  });
  it('requires substantive captured content and identity, not a search destination', () => {
    const profile: PlatformProbeResult = {
      platform: 'trustpilot', status: 'ok', signals: { profileExists: true },
      evidence: { kind: 'verified_profile', sourceUrl: 'https://www.trustpilot.com/review/example.com', capturedAt: '2026-09-14T00:00:00Z', responseStatus: 200, excerpt: 'Example brand official customer review listing with a link to the matching company website.', identityMatch: true, observation: 'observed' },
    };
    expect(hasVerifiedProfile(profile)).toBe(true);
    expect(hasVerifiedProfile({ ...profile, evidence: { ...profile.evidence!, sourceUrl: 'https://www.google.com/search?q=Example' } })).toBe(false);
    expect(hasVerifiedProfile({ ...profile, evidence: { ...profile.evidence!, identityMatch: false } })).toBe(false);
    expect(hasVerifiedProfile({ ...profile, evidence: { ...profile.evidence!, observation: 'blocked' } })).toBe(false);
    expect(hasVerifiedProfile({ ...profile, evidence: undefined })).toBe(false);
  });
});
