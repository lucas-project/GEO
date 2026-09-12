import type { InfluenceScores, OffSitePresenceReport, PlatformId, PlatformProbeResult } from './schemas';
import { countHighEngagementPosts } from './engagement';
import type { SearchSupplementResult } from './search-supplement';

const AUTHORITY_MEDIA = [
  'techcrunch.com',
  'forbes.com',
  'wired.com',
  'theverge.com',
  'reuters.com',
  'bloomberg.com',
  'bbc.com',
  'cnn.com',
  'theguardian.com',
  'nytimes.com',
  'motortrend.com',
  'autoweek.com',
  'caranddriver.com',
  'topgear.com',
  'autocar.co.uk',
];

const MEDIA_HOST_FRAGMENTS = [
  'forbes',
  'reuters',
  'bloomberg',
  'bbc',
  'cnn',
  'techcrunch',
  'wired',
  'theverge',
  'guardian',
  'nytimes',
  'motortrend',
  'autoweek',
  'caranddriver',
  'topgear',
  'autocar',
  'businessinsider',
  'cnbc',
  'ft.com',
  'wsj.com',
];

function scoreD3ReviewPlatform(
  platform: PlatformProbeResult | undefined,
  weights: { full: number; fallback: number; partial: number },
): number {
  if (!platform || platform.status === 'skipped') return 0;
  if (platform.signals.profileExists) {
    return platform.signals.sameAsFallback ? weights.fallback : weights.full;
  }
  if (platform.status === 'limited_data') {
    if ((platform.signals.reviewCount ?? 0) > 0) return weights.partial;
    if (platform.raw && 'searchEvidence' in platform.raw) return Math.max(2, weights.partial - 2);
    if (platform.url && /g2\.com|capterra\.com|trustpilot\.com/i.test(platform.url)) {
      return Math.max(2, weights.partial - 1);
    }
  }
  if (platform.platform === 'trustpilot' && platform.status === 'unclaimed') return 2;
  return 0;
}

/** When B2B review sites are skipped (e.g. automotive), credit Trustpilot + web footprint. */
function scoreD3CategoryReviewProxy(platforms: OffSitePresenceReport['platforms']): number {
  const g2Skipped = platforms.g2?.status === 'skipped';
  const capterraSkipped = platforms.capterra?.status === 'skipped';
  if (!g2Skipped || !capterraSkipped) return 0;

  let proxy = 0;
  const tp = platforms.trustpilot;
  if (tp?.signals.profileExists) proxy += 10;
  else if (tp?.status === 'limited_data' || tp?.status === 'unclaimed') proxy += 5;

  const siteHits = platforms.site_search?.signals.searchHitEstimate ?? 0;
  if (siteHits >= 15) proxy += 8;
  else if (siteHits >= 5) proxy += 5;
  else if (siteHits >= 1) proxy += 2;

  return Math.min(24, proxy);
}

export function scoreD3(platforms: OffSitePresenceReport['platforms']): number {
  let score = 0;
  score += scoreD3ReviewPlatform(platforms.g2, { full: 10, fallback: 5, partial: 6 });
  score += scoreD3ReviewPlatform(platforms.capterra, { full: 8, fallback: 4, partial: 5 });
  score += scoreD3ReviewPlatform(platforms.trustpilot, { full: 10, fallback: 5, partial: 6 });
  score = Math.max(score, scoreD3CategoryReviewProxy(platforms));
  return Math.min(35, score);
}

export interface SupplementScoreInput {
  socialCount?: number;
  offSiteDomainCount?: number;
  generalHitEstimate?: number;
  curationApplied?: boolean;
  curationKept?: number;
  mediaDomains?: string[];
  discoveryDomains?: string[];
}

export interface MediaScoreInput {
  serperMediaMentions?: number;
  primarySourceDomains?: string[];
  supplement?: SupplementScoreInput;
  redditLinkDomains?: string[];
  wikipediaPresent?: boolean;
}

export function scoreD4SupplementBonus(supplement?: SupplementScoreInput): number {
  if (!supplement) return 0;
  let bonus = 0;

  const social = supplement.socialCount ?? 0;
  if (social > 0) bonus += Math.min(8, social * 2);

  const domains = supplement.offSiteDomainCount ?? 0;
  const general = supplement.generalHitEstimate ?? 0;
  if (domains >= 3 || general >= 3) bonus += 2;

  if (supplement.curationApplied && (supplement.curationKept ?? 0) > 0) bonus += 2;

  return bonus;
}

/** Credit verified community presence when probes succeed but engagement metrics are thin. */
export function scoreD4PlatformPresence(
  platforms: OffSitePresenceReport['platforms'],
): number {
  let bonus = 0;
  const reddit = platforms.reddit;
  if (reddit?.status === 'ok') {
    const subs = reddit.subreddits?.length ?? 0;
    const posts = reddit.signals.postCount ?? reddit.posts?.length ?? 0;
    if (subs >= 2 || reddit.signals.profileExists) bonus += 3;
    else if (subs >= 1 || posts > 0) bonus += 2;
  }
  const quora = platforms.quora;
  if (quora?.status === 'ok' && quora.signals.profileExists) bonus += 2;

  for (const id of ['whirlpool', 'productreview', 'ozbargain'] as const) {
    const platform = platforms[id];
    if (!platform || platform.status === 'skipped') continue;
    const posts = platform.signals.postCount ?? platform.posts?.length ?? 0;
    if (platform.status === 'ok' && posts > 0) bonus += 2;
    else if (platform.signals.profileExists || (platform.signals.searchHitEstimate ?? 0) > 0) {
      bonus += 1;
    }
  }

  return Math.min(6, bonus);
}

export function scoreD4(
  platforms: OffSitePresenceReport['platforms'],
  redditHighEngagement: number,
  supplement?: SupplementScoreInput,
): number {
  let score = 0;

  if (redditHighEngagement >= 10) score += 10;
  else if (redditHighEngagement >= 3) score += 6;
  else if (redditHighEngagement >= 1) score += 3;

  const quoraAnswers = platforms.quora?.signals.answerCount ?? 0;
  if (quoraAnswers >= 50) score += 8;
  else if (quoraAnswers >= 10) score += 5;
  else if (quoraAnswers > 0) score += 2;

  const siteHits = platforms.site_search?.signals.searchHitEstimate ?? 0;
  if (siteHits > 100) score += 4;
  else if (siteHits > 10) score += 2;

  score += scoreD4PlatformPresence(platforms);
  score += scoreD4SupplementBonus(supplement);

  return Math.min(25, score);
}

function countMediaDomains(domains: string[]): number {
  return domains.filter((d) =>
    MEDIA_HOST_FRAGMENTS.some((frag) => d.includes(frag)),
  ).length;
}

export function scoreD5FromSupplement(supplement?: SupplementScoreInput): number {
  if (!supplement) return 0;

  const authorityHits = countMediaDomains([
    ...(supplement.mediaDomains ?? []),
    ...(supplement.discoveryDomains ?? []),
  ]);
  if (authorityHits >= 3) return 12;
  if (authorityHits >= 2) return 8;
  if (authorityHits >= 1) return 5;

  const discovery = supplement.discoveryDomains?.length ?? 0;
  const general = supplement.generalHitEstimate ?? 0;
  if (discovery >= 2 || general >= 3) return 6;
  if (discovery >= 1 || general >= 1) return 3;

  return 0;
}

export function scoreD5(input: MediaScoreInput): number {
  let score = 0;

  const serper = input.serperMediaMentions ?? 0;
  if (serper >= 2) score = 15;
  else if (serper === 1) score = 12;
  else {
    const verticalHits = countMediaDomains(input.primarySourceDomains ?? []);
    if (verticalHits >= 2) score = 10;
    else if (verticalHits === 1) score = 6;
  }

  const supplementScore = scoreD5FromSupplement(input.supplement);
  const redditMedia = countMediaDomains(input.redditLinkDomains ?? []);
  let redditScore = 0;
  if (redditMedia >= 2) redditScore = 8;
  else if (redditMedia >= 1) redditScore = 5;

  const wikiScore = input.wikipediaPresent ? 8 : 0;

  return Math.min(20, Math.max(score, supplementScore, redditScore, wikiScore));
}

function mediaDomainsFromSupplement(supplement: SearchSupplementResult): string[] {
  const domains = new Set<string>([
    ...supplement.discoveryDomains,
    ...supplement.offSiteDomains,
  ]);
  for (const hits of Object.values(supplement.byPlatform)) {
    for (const h of hits ?? []) {
      try {
        domains.add(new URL(h.url).hostname.replace(/^www\./, ''));
      } catch {
        /* skip */
      }
    }
  }
  return [...domains].filter((d) =>
    MEDIA_HOST_FRAGMENTS.some((frag) => d.includes(frag)),
  );
}

export function supplementScoreInputFromResult(
  supplement: SearchSupplementResult | null | undefined,
): SupplementScoreInput | undefined {
  if (!supplement) return undefined;
  return {
    socialCount: supplement.social.length,
    offSiteDomainCount: supplement.offSiteDomains.length,
    generalHitEstimate: supplement.generalHitEstimate,
    curationApplied: supplement.curation?.applied,
    curationKept: supplement.curation?.kept,
    mediaDomains: mediaDomainsFromSupplement(supplement),
    discoveryDomains: supplement.discoveryDomains,
  };
}

export function redditOutboundMediaDomains(
  platforms: OffSitePresenceReport['platforms'],
): string[] {
  const hosts = new Set<string>();
  for (const post of platforms.reddit?.posts ?? []) {
    if (!post.url || /reddit\.com/i.test(post.url)) continue;
    try {
      hosts.add(new URL(post.url).hostname.replace(/^www\./, ''));
    } catch {
      /* skip */
    }
  }
  return [...hosts];
}

const RAW_MAX_TOTAL = 80;
const DISPLAY_MAX = { reviews: 40, community: 35, media: 25 } as const;

function scaleRawToDisplay(d3: number, d4: number, d5: number): {
  reviews: number;
  community: number;
  media: number;
  total: number;
} {
  const reviews = Math.min(DISPLAY_MAX.reviews, Math.round((d3 / 35) * DISPLAY_MAX.reviews));
  const community = Math.min(
    DISPLAY_MAX.community,
    Math.round((d4 / 25) * DISPLAY_MAX.community),
  );
  const media = Math.min(DISPLAY_MAX.media, Math.round((d5 / 20) * DISPLAY_MAX.media));
  const total = Math.min(100, Math.round(((d3 + d4 + d5) / RAW_MAX_TOTAL) * 100));
  return { reviews, community, media, total };
}

export interface NotabilityFloorInput {
  platforms: OffSitePresenceReport['platforms'];
  redditHighEngagement: number;
  supplement?: SupplementScoreInput;
  wikipediaPresent?: boolean;
  entityConfidence?: number;
  entityNeedsReview?: boolean;
  searchPlanCategory?: string;
}

export function applyNotabilityFloor(
  scaledTotal: number,
  input: NotabilityFloorInput,
): number {
  let floor = 0;
  const { platforms } = input;

  if (input.wikipediaPresent) floor += 12;

  const reddit = platforms.reddit;
  const postCount = reddit?.signals.postCount ?? reddit?.posts?.length ?? 0;
  if (reddit?.status === 'ok' && postCount >= 5) floor += 15;
  if ((reddit?.subreddits?.length ?? 0) >= 1) floor += 5;
  if (input.redditHighEngagement >= 3) floor += 8;

  const siteHits = platforms.site_search?.signals.searchHitEstimate ?? 0;
  if (siteHits >= 10) floor += 8;

  const supplement = input.supplement;
  if ((supplement?.offSiteDomainCount ?? 0) >= 5) floor += 5;
  if ((supplement?.socialCount ?? 0) >= 2) floor += 5;

  if ((input.entityConfidence ?? 0) >= 0.85 && !input.entityNeedsReview) floor += 5;

  const g2Skipped = platforms.g2?.status === 'skipped';
  const capterraSkipped = platforms.capterra?.status === 'skipped';
  const cat = input.searchPlanCategory;
  if (
    g2Skipped &&
    capterraSkipped &&
    (cat === 'automotive' || cat === 'consumer_brand')
  ) {
    floor += 8;
  }

  return Math.max(scaledTotal, Math.min(70, floor));
}

export function computeInfluenceScores(input: {
  platforms: OffSitePresenceReport['platforms'];
  redditHighEngagement: number;
  serperMediaMentions?: number;
  primarySourceDomains?: string[];
  supplement?: SupplementScoreInput;
  wikipediaPresent?: boolean;
  entityConfidence?: number;
  entityNeedsReview?: boolean;
  searchPlanCategory?: string;
}): InfluenceScores {
  const d3 = scoreD3(input.platforms);
  const d4 = scoreD4(input.platforms, input.redditHighEngagement, input.supplement);
  const d5 = scoreD5({
    serperMediaMentions: input.serperMediaMentions,
    primarySourceDomains: input.primarySourceDomains,
    supplement: input.supplement,
    redditLinkDomains: redditOutboundMediaDomains(input.platforms),
    wikipediaPresent: input.wikipediaPresent,
  });

  const scaled = scaleRawToDisplay(d3, d4, d5);
  const total = applyNotabilityFloor(scaled.total, {
    platforms: input.platforms,
    redditHighEngagement: input.redditHighEngagement,
    supplement: input.supplement,
    wikipediaPresent: input.wikipediaPresent,
    entityConfidence: input.entityConfidence,
    entityNeedsReview: input.entityNeedsReview,
    searchPlanCategory: input.searchPlanCategory,
  });

  let band: InfluenceScores['band'] = 'needs_work';
  if (total >= 75) band = 'excellent';
  else if (total >= 50) band = 'qualified';

  return {
    total,
    reviews: scaled.reviews,
    community: scaled.community,
    media: scaled.media,
    band,
    raw: { d3, d4, d5 },
  };
}

const PROBE_PLATFORM_IDS: PlatformId[] = [
  'reddit',
  'quora',
  'g2',
  'capterra',
  'trustpilot',
  'whirlpool',
  'productreview',
  'ozbargain',
];

export function mergeSearchSupplementIntoPlatforms(
  platforms: Record<string, PlatformProbeResult>,
  supplement: SearchSupplementResult,
): void {
  for (const id of PROBE_PLATFORM_IDS) {
    const hits = supplement.byPlatform[id];
    const best = hits?.[0];
    if (!best) continue;

    const current = platforms[id];
    if (current?.status === 'skipped') continue;

    const failed =
      !current ||
      current.status === 'unreachable' ||
      current.status === 'captcha_blocked' ||
      (current.status === 'limited_data' && !current.signals.profileExists);

    if (!failed && current?.status === 'ok') continue;

    platforms[id] = {
      platform: id,
      status: current?.status === 'ok' ? 'ok' : 'limited_data',
      url: best.url,
      message: 'Search supplement',
      signals: {
        ...current?.signals,
        profileExists: true,
        searchHitEstimate: hits?.length ?? current?.signals.searchHitEstimate,
      },
      raw: {
        ...current?.raw,
        searchEvidence: hits?.slice(0, 5).map((h) => ({
          url: h.url,
          title: h.title,
          engine: h.engine,
        })),
      },
      posts: current?.posts,
      subreddits: current?.subreddits,
    };
  }

  const siteSearch = platforms.site_search;
  const domainCount = supplement.offSiteDomains.length;
  const estimate = Math.max(supplement.generalHitEstimate, domainCount);
  const siteOk = estimate >= 3 || domainCount >= 3;

  if (
    estimate > 0 &&
    (!siteSearch ||
      siteSearch.status === 'unreachable' ||
      (siteSearch.signals.searchHitEstimate ?? 0) < estimate)
  ) {
    platforms.site_search = {
      platform: 'site_search',
      status: siteOk ? 'ok' : 'limited_data',
      signals: {
        ...siteSearch?.signals,
        searchHitEstimate: Math.max(
          siteSearch?.signals.searchHitEstimate ?? 0,
          estimate,
        ),
      },
      message: 'Search supplement — general off-site hits',
      raw: {
        ...siteSearch?.raw,
        topDomains: supplement.offSiteDomains,
        source: 'search-supplement',
      },
    };
  }
}

export function mergeSerperIntoPlatforms(
  platforms: Record<string, PlatformProbeResult>,
  boost: {
    redditMentionEstimate: number | null;
    verifiedPlatforms: string[];
  },
): void {
  if ((boost.redditMentionEstimate ?? 0) > 0 && platforms.reddit?.status !== 'ok') {
    platforms.reddit = {
      ...platforms.reddit,
      platform: 'reddit',
      status: 'limited_data',
      message: 'Serper boost — Reddit mentions estimated',
      signals: {
        ...platforms.reddit?.signals,
        searchHitEstimate: boost.redditMentionEstimate ?? undefined,
        postCount: boost.redditMentionEstimate ?? undefined,
      },
    };
  }

  const platformIds = new Set(['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'site_search']);
  for (const p of boost.verifiedPlatforms) {
    if (!platformIds.has(p)) continue;
    const key = p as keyof typeof platforms;
    if (platforms[key] && platforms[key]!.status === 'unreachable') {
      platforms[key] = {
        ...platforms[key]!,
        status: 'limited_data',
        signals: { ...platforms[key]!.signals, profileExists: true },
        message: 'Serper verified profile',
      };
    }
  }
}

export { countHighEngagementPosts };
