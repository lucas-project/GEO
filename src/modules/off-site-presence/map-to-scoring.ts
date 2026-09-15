import type { PresenceProbeResult } from '@modules/brand-presence-probe';
import type { DimensionScore } from '@modules/geo-audit';
import { PLATFORM_LABELS, PRESENCE_PLATFORMS, type PresencePlatform } from '@modules/brand-presence';
import type { OffSitePresenceReport, InfluenceScores } from './schemas';
import { PLATFORM_IDS } from './schemas';
import { enforcePresenceEvidence, hasVerifiedProfile } from './evidence-policy';

/** Off-site influence total is already 0–100. */
export function mapInfluenceToOffSiteScore(scores: InfluenceScores): number | null {
  if (scores.total == null) return null;
  return Math.max(0, Math.min(100, scores.total));
}

export function buildOffSitePresenceReasons(report: OffSitePresenceReport): string[] {
  if (report.scores.total == null) return ['Insufficient observed evidence to rate off-site visibility. Citation frequency has not been measured.'];
  const reasons: string[] = [];
  const { scores, entity, engagement, platforms } = report;

  reasons.push(
    `Deep off-site scan: ${scores.total}/100 influence (${scores.band.replace(/_/g, ' ')})`,
  );

  const verified = PLATFORM_IDS.filter((id) => {
    const p = platforms[id];
    return p && hasVerifiedProfile(p);
  });
  if (verified.length > 0) {
    reasons.push(
      `Live profiles detected: ${verified.map((id) => PLATFORM_LABELS[id as keyof typeof PLATFORM_LABELS] ?? id).join(', ')}`,
    );
  }

  if (engagement.redditHighEngagementCount > 0) {
    reasons.push(
      `${engagement.redditHighEngagementCount} high-engagement Reddit post${engagement.redditHighEngagementCount === 1 ? '' : 's'}`,
    );
  }

  if (entity.needsReview) {
    reasons.push(`Brand entity "${entity.primaryBrand}" needs manual confirmation`);
  }

  const topRec = report.recommendations.find((r) => r.priority === 'high');
  if (topRec) reasons.push(topRec.text);

  return reasons.slice(0, 6);
}

export function mapReportToPresenceProbe(report: OffSitePresenceReport): PresenceProbeResult {
  report = enforcePresenceEvidence(report);
  const hasSerper = report.meta.sources.includes('serper');
  const presenceSet = new Set<string>(PRESENCE_PLATFORMS);
  const verified: PresencePlatform[] = [];
  for (const id of PLATFORM_IDS) {
    if (!presenceSet.has(id)) continue;
    const p = report.platforms[id];
    if (p && hasVerifiedProfile(p)) {
      verified.push(id as PresencePlatform);
    }
  }

  const reviewUrls: string[] = [];
  for (const id of ['g2', 'capterra', 'trustpilot'] as const) {
    const p = report.platforms[id];
    if (p?.url && hasVerifiedProfile(p)) reviewUrls.push(p.url);
  }

  return {
    source: hasSerper ? 'serper' : 'crawl-only',
    brandName: report.entity.primaryBrand,
    siteDomain: report.meta.domain,
    redditMentionEstimate:
      report.serperBoost?.redditMentionEstimate ??
      report.platforms.reddit?.signals.postCount ??
      null,
    reviewProfilesFound: reviewUrls,
    mediaMentions: report.serperBoost?.mediaMentions ?? 0,
    primarySourceDomains: report.serperBoost?.verifiedPlatforms ?? [],
    brandDescriptionSnippet: null,
    verifiedPlatforms: verified,
    searchQueries: [],
  };
}

export function buildOffSiteDimensionScore(report: OffSitePresenceReport): DimensionScore {
  const score = mapInfluenceToOffSiteScore(report.scores);
  if (score == null) throw new Error('Insufficient evidence: no off-site score is available');
  return {
    score,
    reasons: buildOffSitePresenceReasons(report),
  };
}
