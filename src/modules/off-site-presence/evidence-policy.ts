import type { OffSitePresenceReport, PlatformProbeResult } from './schemas';

export function isSearchDestination(raw: string): boolean {
  try {
    const url = new URL(raw);
    return /(^|\.)(google|bing|duckduckgo)\./i.test(url.hostname) || /\/(search|find)(\/|$)/i.test(url.pathname) || url.searchParams.has('q');
  } catch { return true; }
}

export function hasVerifiedProfile(p: PlatformProbeResult): boolean {
  const e = p.evidence;
  return Boolean(e && e.kind === 'verified_profile' && e.observation === 'observed' &&
    e.identityMatch && e.excerpt && e.excerpt.trim().length >= 40 &&
    e.capturedAt && Number.isFinite(Date.parse(e.capturedAt)) &&
    e.responseStatus && e.responseStatus >= 200 && e.responseStatus < 300 &&
    !isSearchDestination(e.sourceUrl));
}

/** Apply on acquisition AND read: legacy flags/search results cannot establish identity. */
export function enforcePresenceEvidence(report: OffSitePresenceReport): OffSitePresenceReport {
  const platforms = { ...report.platforms };
  for (const [id, p] of Object.entries(platforms)) {
    const verified = hasVerifiedProfile(p);
    platforms[id as keyof typeof platforms] = {
      ...p,
      signals: verified ? p.signals : { ...p.signals, profileExists: undefined, unclaimed: undefined },
      evidence: p.evidence ?? {
        kind: p.url && isSearchDestination(p.url) ? 'search_entry' : 'discovered_link',
        sourceUrl: p.url ?? '',
        observation: p.status === 'skipped' ? 'not_run' : p.status === 'captcha_blocked' ? 'blocked' : p.status === 'unreachable' ? 'unreachable' : 'unknown',
      },
    };
  }
  // Existing heuristic scores have no validated coverage denominator or citation experiment.
  // Keep observations useful without turning missing acquisition into a visibility verdict.
  return {
    ...report, platforms,
    scores: { total: null, band: 'insufficient_evidence', reviews: null, community: null, media: null },
    insights: undefined,
    serperBoost: undefined,
    recommendations: [{ priority: 'high', category: 'general', text: 'Review the captured sources and confirm the brand identity. Coverage is insufficient for a visibility rating; citation frequency has not been measured.' }],
  };
}
