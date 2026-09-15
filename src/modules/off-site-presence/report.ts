import {
  rankRedditPosts,
  rankRedditPostsForDisplay,
  rankFacebookPostsForDisplay,
  rankCrossPlatformPostsForDisplay,
  countHighEngagementPosts,
  redditHitsToPosts,
  dedupeRedditPosts,
  REDDIT_DISPLAY_TARGET,
  CROSS_PLATFORM_DISPLAY_TARGET,
  redditDisplayShortfall,
  crossPlatformDisplayShortfall,
} from './engagement';
import { curateAllDiscussionPostsForDisplay } from './curate-discussion-posts';
import { facebookHitsToPosts, dedupeFacebookPosts } from './facebook-posts';
import { crossPlatformHitsToPosts } from './cross-platform-posts';
import { mergeCuratedWithCandidates } from './display-merge';
import type { DiscussionValueContext } from './discussion-value-score';
import { inferMarketFromDomain } from './market-country';
import { mergeRedditCurationKeywords } from './reddit-keywords';
import {
  filterRelevantSubreddits,
  uniqueSubredditsFromPosts,
} from './reddit-communities';
import {
  computeInfluenceScores,
  mergeSearchSupplementIntoPlatforms,
  mergeSerperIntoPlatforms,
  scoreD3,
  scoreD4,
  scoreD5FromSupplement,
  redditOutboundMediaDomains,
  supplementScoreInputFromResult,
} from './score';
import { debugPresenceLog } from './debug-agent-log';
import type {
  BrandEntityResult,
  OffSitePresenceReport,
  PlatformId,
  PlatformProbeResult,
  Recommendation,
} from './schemas';
import { OffSitePresenceReportSchema, PLATFORM_IDS } from './schemas';
import type { SerperBoostResult } from './serper-boost';
import type { SearchSupplementResult } from './search-supplement';
import type { PresenceSearchPlan } from './search-plan-types';
import { buildPresenceInsights } from './insights';
import { enforcePresenceEvidence } from './evidence-policy';

const PLATFORM_DISPLAY: Record<string, string> = {
  reddit: 'Reddit',
  quora: 'Quora',
  g2: 'G2',
  capterra: 'Capterra',
  trustpilot: 'Trustpilot',
  whirlpool: 'Whirlpool Forums',
  productreview: 'ProductReview.com.au',
  ozbargain: 'OzBargain',
  site_search: 'web search',
};

function displayPlatform(id: PlatformId): string {
  return PLATFORM_DISPLAY[id] ?? id;
}

export function buildPresenceSummary(report: OffSitePresenceReport): string {
  if (report.scores.total == null) return 'Insufficient evidence to rate off-site visibility. Citation frequency is not measured.';
  const brand = report.entity.primaryBrand;
  const found: string[] = [];
  const skipped: string[] = [];

  for (const id of PLATFORM_IDS) {
    const p = report.platforms[id];
    if (!p) continue;
    if (p.status === 'skipped') {
      skipped.push(displayPlatform(id));
    } else if (
      p.status === 'ok' ||
      (p.status === 'limited_data' && p.signals.profileExists) ||
      p.status === 'unclaimed'
    ) {
      found.push(displayPlatform(id));
    }
  }

  const parts: string[] = [];
  if (found.length > 0) {
    parts.push(`${brand} has verifiable presence on ${found.join(', ')}.`);
  } else {
    parts.push(`We found little verified off-site presence for ${brand}.`);
  }

  if (skipped.length > 0) {
    parts.push(
      `${skipped.join(', ')} ${skipped.length === 1 ? 'was' : 'were'} not checked — not relevant for this brand type.`,
    );
  }

  if (report.scores.total < 50) {
    parts.push(
      'Scores under 50/100 suggest AI answers may rarely cite you as an off-site authority; focus on the gaps below.',
    );
  } else if (report.scores.band === 'qualified') {
    parts.push('You are in the qualified range — strengthening weak channels can push toward excellent.');
  }

  return parts.join(' ');
}

export function buildRecommendations(
  report: Pick<OffSitePresenceReport, 'platforms' | 'entity' | 'scores' | 'engagement' | 'meta'>,
): Recommendation[] {
  if (report.scores.total == null || report.scores.media == null || report.scores.reviews == null || report.scores.community == null) return [];
  const recs: Recommendation[] = [];

  if (report.entity.needsReview) {
    recs.push({
      priority: 'high',
      category: 'entity',
      text: `Confirm brand name "${report.entity.primaryBrand}" on your site (${(report.entity.confidence * 100).toFixed(0)}% confidence) before acting on scores.`,
    });
  }

  if (report.entity.flags.subBrands.length > 0) {
    recs.push({
      priority: 'medium',
      category: 'entity',
      text: `Related sub-brands detected (${report.entity.flags.subBrands.slice(0, 3).join(', ')}) — scan or link them if they affect how AI describes your company.`,
    });
  }

  const reddit = report.platforms.reddit;
  if (reddit?.subreddits?.length) {
    const subs = reddit.subreddits.slice(0, 2).map((s) => `r/${s}`).join(', ');
    recs.push({
      priority: 'high',
      category: 'community',
      text: `Join conversations on ${subs} — active threads show your audience discusses the brand there.`,
    });
  } else if (reddit?.status === 'unreachable' || reddit?.status === 'limited_data') {
    recs.push({
      priority: 'medium',
      category: 'community',
      text: 'Link an official subreddit or community page from your website — limited Reddit visibility reduces how often AI cites community discussion.',
    });
  }

  if ((reddit?.posts?.length ?? 0) >= 3 && engagementHasHighPosts(report.engagement)) {
    recs.push({
      priority: 'medium',
      category: 'community',
      text: 'Highlight top Reddit threads in press or blog posts — high-engagement discussions reinforce brand authority in AI training data.',
    });
  }

  const g2 = report.platforms.g2;
  if (g2?.status !== 'skipped' && g2?.signals.sameAsFallback) {
    recs.push({
      priority: 'medium',
      category: 'reviews',
      text: 'Complete your G2 product page — your site links to G2 but live listing data could not be verified automatically.',
    });
  }

  if (report.platforms.trustpilot?.status === 'unclaimed') {
    recs.push({
      priority: 'high',
      category: 'reviews',
      text: 'Claim your Trustpilot profile — an unclaimed listing weakens review-site signals that AI models use for trust.',
    });
  } else if (report.platforms.trustpilot?.signals.profileExists && (report.platforms.trustpilot.signals.reviewCount ?? 0) < 10) {
    recs.push({
      priority: 'medium',
      category: 'reviews',
      text: 'Encourage satisfied customers to leave Trustpilot reviews — volume helps AI models treat your brand as established.',
    });
  }

  if (report.platforms.quora?.status === 'limited_data') {
    recs.push({
      priority: 'low',
      category: 'community',
      text: 'Answer relevant Quora questions in your category — expert answers help AI associate your brand with the topic.',
    });
  }

  if (report.scores.media < 15) {
    recs.push({
      priority: 'medium',
      category: 'media',
      text: 'Pursue earned media and industry press — news domains strongly influence whether LLMs cite you as an authority.',
    });
  }

  if (report.scores.reviews < 15 && report.meta.searchPlan?.category === 'b2b_saas') {
    recs.push({
      priority: 'high',
      category: 'reviews',
      text: 'Complete G2 and Capterra profiles with screenshots and case studies — B2B buyers and AI both rely on these listings.',
    });
  }

  recs.push({
    priority: 'medium',
    category: 'website',
    text: 'Add sameAs schema.org links on your site footer pointing to Reddit, Trustpilot, LinkedIn, and other verified profiles.',
  });

  if (report.scores.band === 'needs_work' && report.scores.total != null && report.scores.total < 50) {
    const focus =
      report.scores.reviews <= report.scores.community && report.scores.reviews <= report.scores.media
        ? 'review-site profiles and Trustpilot'
        : report.scores.community <= report.scores.media
          ? 'Reddit, Quora, and community threads'
          : 'press coverage and reference sites';
    recs.push({
      priority: 'high',
      category: 'general',
      text: `Raise off-site influence above 50/100 — prioritize ${focus} so AI models treat you as a cited authority.`,
    });
  }

  return recs.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  }).slice(0, 12);
}

function engagementHasHighPosts(
  engagement: OffSitePresenceReport['engagement'],
): boolean {
  return engagement.redditHighEngagementCount > 0 || engagement.redditTopPosts.length > 0;
}

export async function assembleReport(input: {
  domain: string;
  siteUrl: string;
  durationMs: number;
  entity: BrandEntityResult;
  platforms: Record<PlatformId, PlatformProbeResult>;
  sources: OffSitePresenceReport['meta']['sources'];
  playwrightEnabled: boolean;
  serperBoost?: SerperBoostResult | null;
  searchSupplement?: SearchSupplementResult | null;
  searchPlan?: PresenceSearchPlan;
  /** Workspace keyword chips (presence UI / target bar). */
  siteKeywords?: string[];
  wikipediaPresent?: boolean;
}): Promise<OffSitePresenceReport> {
  const platforms = { ...input.platforms };

  if (input.serperBoost) {
    mergeSerperIntoPlatforms(platforms, {
      redditMentionEstimate: input.serperBoost.redditMentionEstimate,
      verifiedPlatforms: input.serperBoost.verifiedPlatforms,
    });
  }

  if (input.searchSupplement) {
    mergeSearchSupplementIntoPlatforms(platforms, input.searchSupplement);
  }

  const probeRedditPosts = (platforms.reddit?.posts ?? []).flat();
  const supplementRedditHits = input.searchSupplement?.byPlatform.reddit ?? [];
  const mergedRedditPosts = dedupeRedditPosts([
    ...probeRedditPosts,
    ...redditHitsToPosts(supplementRedditHits),
  ]);
  const redditKeywords = mergeRedditCurationKeywords(
    input.siteKeywords,
    input.searchPlan?.brandKeywords,
  );
  const marketCountry = inferMarketFromDomain(input.domain);
  const valueCtx: DiscussionValueContext = {
    brand: input.entity.primaryBrand,
    domain: input.domain,
    aliases: input.entity.aliases,
    siteKeywords: redditKeywords,
    marketCountry,
  };
  const mergedFacebookPosts = dedupeFacebookPosts(
    facebookHitsToPosts(input.searchSupplement?.facebookPosts ?? []),
  );
  const mergedCrossPlatform = crossPlatformHitsToPosts(
    input.searchSupplement?.crossPlatformPosts ?? {},
  );

  const curated = await curateAllDiscussionPostsForDisplay({
    brand: input.entity.primaryBrand,
    domain: input.domain,
    siteKeywords: redditKeywords,
    brandAliases: input.entity.aliases,
    searchPlanCategory: input.searchPlan?.category,
    searchPlanRationale: input.searchPlan?.rationale,
    marketCountry,
    reddit: mergedRedditPosts,
    facebook: mergedFacebookPosts,
    crossPlatform: mergedCrossPlatform,
  });

  const curatedRedditPosts = curated.reddit;
  const curatedFacebookPosts = curated.facebook;
  const curatedCrossPlatform = curated.crossPlatform;
  const redditTopPosts = rankRedditPosts(
    mergeCuratedWithCandidates(curatedRedditPosts, mergedRedditPosts),
  );
  const redditDisplayPosts = rankRedditPostsForDisplay(
    mergeCuratedWithCandidates(curatedRedditPosts, mergedRedditPosts),
    valueCtx,
  );
  const redditDisplayShortfallCount = redditDisplayShortfall(redditDisplayPosts.length);
  const redditHighEngagementCount = countHighEngagementPosts(curatedRedditPosts);

  const facebookDisplayPosts = rankFacebookPostsForDisplay(
    mergeCuratedWithCandidates(curatedFacebookPosts, mergedFacebookPosts),
    valueCtx,
  );
  const crossPlatformDisplayPosts = rankCrossPlatformPostsForDisplay(
    mergeCuratedWithCandidates(curatedCrossPlatform, mergedCrossPlatform),
    valueCtx,
  );
  const crossPlatformDisplayShortfallCount = crossPlatformDisplayShortfall(
    crossPlatformDisplayPosts.length,
  );

  if (platforms.reddit) {
    const fromPosts = uniqueSubredditsFromPosts(curatedRedditPosts);
    const filteredSubs = filterRelevantSubreddits(
      fromPosts.length > 0 ? fromPosts : (platforms.reddit.subreddits ?? []),
      input.entity.primaryBrand,
      redditKeywords,
      input.searchPlan?.category,
    );
    platforms.reddit = {
      ...platforms.reddit,
      subreddits: filteredSubs.length > 0 ? filteredSubs : fromPosts.slice(0, 8),
      signals: {
        ...platforms.reddit.signals,
        postCount: curatedRedditPosts.length,
        highEngagementPostCount: redditHighEngagementCount,
      },
    };
  }

  const supplementInput = supplementScoreInputFromResult(input.searchSupplement);
  const scores = computeInfluenceScores({
    platforms,
    redditHighEngagement: redditHighEngagementCount,
    serperMediaMentions: input.serperBoost?.mediaMentions,
    primarySourceDomains: input.serperBoost?.primarySourceDomains,
    supplement: supplementInput,
    wikipediaPresent: input.wikipediaPresent,
    entityConfidence: input.entity.confidence,
    entityNeedsReview: input.entity.needsReview,
    searchPlanCategory: input.searchPlan?.category,
  });

  // #region agent log
  debugPresenceLog(
    'report.ts:scores',
    'influence score breakdown',
    {
      reviews: scores.reviews,
      community: scores.community,
      media: scores.media,
      total: scores.total,
      raw: scores.raw,
      redditHighEngagement: redditHighEngagementCount,
      redditPostCount: platforms.reddit?.posts?.length ?? 0,
      redditSubredditCount: platforms.reddit?.subreddits?.length ?? 0,
      redditStatus: platforms.reddit?.status,
      quoraAnswers: platforms.quora?.signals.answerCount ?? 0,
      quoraStatus: platforms.quora?.status,
      g2Profile: platforms.g2?.signals.profileExists ?? false,
      wikipediaPresent: input.wikipediaPresent ?? false,
      redditMediaDomains: redditOutboundMediaDomains(platforms),
      supplementInput: supplementInput ?? null,
      scoreD5Supplement: scoreD5FromSupplement(supplementInput),
      scoreD3Raw: scoreD3(platforms),
      scoreD4Raw: scoreD4(platforms, redditHighEngagementCount, supplementInput),
    },
    'H3-H5',
  );
  // #endregion

  const partial: OffSitePresenceReport = {
    meta: {
      domain: input.domain,
      siteUrl: input.siteUrl,
      scannedAt: new Date().toISOString(),
      durationMs: input.durationMs,
      sources: input.sources,
      playwrightEnabled: input.playwrightEnabled,
      searchPlan: input.searchPlan,
      marketCountry: marketCountry
        ? {
            code: marketCountry.code,
            name: marketCountry.name,
            queryHint: marketCountry.queryHint,
            source: marketCountry.source,
          }
        : undefined,
    },
    entity: input.entity,
    platforms,
    engagement: {
      redditTopPosts,
      redditDisplayPosts,
      redditDisplayTarget: REDDIT_DISPLAY_TARGET,
      redditDisplayShortfall: redditDisplayShortfallCount,
      redditHighEngagementCount,
      facebookDisplayPosts,
      crossPlatformDisplayPosts,
      crossPlatformDisplayTarget: CROSS_PLATFORM_DISPLAY_TARGET,
      crossPlatformDisplayShortfall: crossPlatformDisplayShortfallCount,
      agentReach: input.searchSupplement?.agentReach,
    },
    scores,
    recommendations: [],
    serperBoost: input.serperBoost
      ? {
          redditMentionEstimate: input.serperBoost.redditMentionEstimate,
          mediaMentions: input.serperBoost.mediaMentions,
          verifiedPlatforms: input.serperBoost.verifiedPlatforms,
        }
      : undefined,
    searchSupplement: input.searchSupplement
      ? {
          queryCount: input.searchSupplement.queries.length,
          social: input.searchSupplement.social,
          offSiteDomains: input.searchSupplement.offSiteDomains,
          curation: input.searchSupplement.curation,
          orchestration: input.searchSupplement.orchestration,
        }
      : undefined,
  };

  partial.recommendations = buildRecommendations(partial);
  partial.insights = buildPresenceInsights(partial, input.searchSupplement);

  for (const id of PLATFORM_IDS) {
    if (!partial.platforms[id]) {
      partial.platforms[id] = {
        platform: id,
        status: 'unreachable',
        signals: {},
        message: input.playwrightEnabled ? 'Not probed' : 'Playwright disabled',
      };
    }
  }

  return enforcePresenceEvidence(OffSitePresenceReportSchema.parse(partial));
}

export function toJson(report: OffSitePresenceReport): string {
  const safe = enforcePresenceEvidence(report);
  return JSON.stringify({ ...safe, scores: { total: null, reviews: null, community: null, media: null, band: 'insufficient_evidence' } }, null, 2);
}

export function toMarkdown(report: OffSitePresenceReport): string {
  report = enforcePresenceEvidence(report);
  const lines: string[] = [];
  lines.push(`# Off-site presence report: ${report.entity.primaryBrand}`);
  lines.push('');
  lines.push(`- **Domain:** ${report.meta.domain}`);
  lines.push(`- **Scanned:** ${report.meta.scannedAt}`);
  lines.push(`- **Duration:** ${(report.meta.durationMs / 1000).toFixed(1)}s`);
  lines.push(`- **Sources:** ${report.meta.sources.join(', ')}`);
  lines.push(
    '- **Visibility:** Insufficient evidence. Citation frequency: not measured.',
  );
  lines.push('');

  if (report.insights) {
    lines.push(`## ${report.insights.headline}`);
    lines.push('');
    lines.push(report.insights.verdict);
    lines.push('');
    if (report.insights.strengths.length > 0) {
      lines.push('### Strengths');
      for (const s of report.insights.strengths) {
        lines.push(`- **${s.title}:** ${s.detail}`);
      }
      lines.push('');
    }
    if (report.insights.gaps.length > 0) {
      lines.push('### Gaps');
      for (const g of report.insights.gaps) {
        lines.push(`- **${g.title}:** ${g.detail}`);
      }
      lines.push('');
    }
  }

  lines.push('## Brand entity');
  lines.push(`- Primary: **${report.entity.primaryBrand}**`);
  lines.push(`- Confidence: ${(report.entity.confidence * 100).toFixed(0)}%`);
  if (report.entity.needsReview) lines.push('- ⚠ Manual review recommended');
  if (report.entity.flags.marketplaceMode) lines.push('- Marketplace mode detected');
  lines.push('');

  lines.push('## Platforms');
  for (const id of PLATFORM_IDS) {
    const p = report.platforms[id];
    if (!p) continue;
    lines.push(`### ${id}`);
    lines.push(`- Status: ${p.status}`);
    if (p.message) lines.push(`- Note: ${p.message}`);
    if (p.signals.profileExists) lines.push('- Profile/listing found');
    if (p.signals.reviewCount) lines.push(`- Reviews: ~${p.signals.reviewCount}`);
    if (p.signals.rating) lines.push(`- Rating: ${p.signals.rating}`);
    if (p.signals.searchHitEstimate) lines.push(`- Search hits: ~${p.signals.searchHitEstimate}`);
    lines.push('');
  }

  if (report.engagement.redditTopPosts.length > 0) {
    lines.push('## Top Reddit discussions');
    for (const post of report.engagement.redditTopPosts) {
      lines.push(
        `- **${post.title}** (${post.upvotes}↑ ${post.comments}💬, score ${post.engagementScore?.toFixed(0) ?? '—'})`,
      );
    }
    lines.push('');
  }

  if (report.recommendations.length > 0) {
    lines.push('## Recommendations');
    for (const r of report.recommendations) {
      lines.push(`- [${r.priority.toUpperCase()}] ${r.text}`);
    }
  }

  return lines.join('\n');
}
