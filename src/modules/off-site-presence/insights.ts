import { PLATFORM_LABELS } from '@modules/brand-presence';
import type {
  OffSitePresenceReport,
  PlatformId,
  PresenceInsights,
} from './schemas';
import { PLATFORM_IDS } from './schemas';
import type { SearchSupplementResult } from './search-supplement';

function platformName(id: PlatformId): string {
  if (id === 'site_search') return 'Web search';
  return PLATFORM_LABELS[id as keyof typeof PLATFORM_LABELS] ?? id;
}

function dimensionNarrative(
  key: 'reviews' | 'community' | 'media',
  score: number,
  max: number,
  report: OffSitePresenceReport,
): { narrative: string; bullets: string[] } {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const bullets: string[] = [];
  const { platforms, engagement, searchSupplement } = report;

  if (key === 'reviews') {
    const tp = platforms.trustpilot;
    if (tp?.signals.profileExists) {
      bullets.push(
        `Trustpilot profile found${tp.signals.rating != null ? ` (${tp.signals.rating}★)` : ''}${tp.signals.reviewCount ? `, ${tp.signals.reviewCount} reviews` : ''}.`,
      );
    } else if (tp?.status === 'unclaimed') {
      bullets.push('Trustpilot listing appears unclaimed.');
    }
    const narrative =
      pct >= 60
        ? 'Review-site presence is solid for the platforms that matter for your category.'
        : pct >= 35
          ? 'Some review signals exist; strengthening Trustpilot and category-relevant listings would help AI trust scores.'
          : 'Little review-site visibility detected — claim profiles where they apply to your industry.';
    return { narrative, bullets };
  }

  if (key === 'community') {
    const reddit = platforms.reddit;
    if (reddit?.subreddits?.length) {
      bullets.push(
        `Relevant communities: ${reddit.subreddits.slice(0, 5).map((s) => `r/${s}`).join(', ')}.`,
      );
    }
    const onTopic = engagement.redditDisplayPosts?.length ?? 0;
    const redditTarget = engagement.redditDisplayTarget ?? 10;
    if (onTopic > 0) {
      bullets.push(`${onTopic} on-topic Reddit thread(s) mentioning your brand or product keywords.`);
    }
    if ((engagement.redditDisplayShortfall ?? 0) > 0) {
      bullets.push(
        `Only ${onTopic} of ${redditTarget} target Reddit threads found after widened search — try more keywords or run again later.`,
      );
    }
    const fbOnTopic = engagement.facebookDisplayPosts?.length ?? 0;
    if (fbOnTopic > 0) {
      bullets.push(`${fbOnTopic} on-topic Facebook discussion(s) from web search.`);
    }
    const crossCount = engagement.crossPlatformDisplayPosts?.length ?? 0;
    if (crossCount > 0) {
      bullets.push(
        `${crossCount} on-topic discussion(s) on other platforms (X, TikTok, Xiaohongshu, Zhihu, Amazon, etc.).`,
      );
    }
    const xhsAdded = engagement.agentReach?.xhsHitsAdded ?? 0;
    if (xhsAdded > 0) {
      bullets.push(`${xhsAdded} Xiaohongshu note(s) from direct xhs-cli search.`);
    }
    const jinaEnriched = engagement.agentReach?.jinaEnriched ?? 0;
    if (jinaEnriched > 0) {
      bullets.push(`${jinaEnriched} Zhihu thread title(s) enriched via Jina Reader.`);
    }
    if (engagement.redditHighEngagementCount > 0) {
      bullets.push(
        `${engagement.redditHighEngagementCount} high-engagement thread(s) — strong signal for AI citation.`,
      );
    }
    const quora = platforms.quora;
    const quoraAnswers = quora?.signals.answerCount ?? 0;
    if (quoraAnswers > 0) {
      bullets.push(`${quoraAnswers} Quora answers tied to the brand.`);
    }
    if (searchSupplement?.social.length) {
      bullets.push(
        `${searchSupplement.social.length} social profile(s) discovered via search.`,
      );
    }
    const narrative =
      pct >= 60
        ? 'Strong community footprint — AI models often pull answers from these discussions.'
        : pct >= 35
          ? 'Moderate community presence; more active threads and expert answers would improve visibility.'
          : 'Limited community signals — Reddit and Q&A sites are where many AI answers source brand context.';
    return { narrative, bullets };
  }

  if (key === 'media') {
  if (searchSupplement?.offSiteDomains.length) {
    const media = searchSupplement.offSiteDomains.filter((d) =>
      /forbes|reuters|bbc|cnn|motortrend|autoweek|topgear|wired/i.test(d),
    );
    if (media.length) bullets.push(`News/media domains in search results: ${media.slice(0, 4).join(', ')}.`);
  }
  if (report.serperBoost?.mediaMentions) {
    bullets.push(`${report.serperBoost.mediaMentions} media mention(s) via Serper boost.`);
  }
  const narrative =
    pct >= 60
      ? 'Good media and reference coverage — authoritative outlets reinforce your brand in AI answers.'
      : pct >= 35
        ? 'Some press and reference signals; more earned media and Wikipedia-style references help.'
        : 'Thin media footprint — pursue press, industry coverage, and encyclopedic references.';
  return { narrative, bullets };
  }

  return { narrative: '', bullets: [] };
}

export function buildPresenceInsights(
  report: OffSitePresenceReport,
  fullSupplement?: SearchSupplementResult | null,
): PresenceInsights {
  const { scores, platforms, entity, engagement, searchSupplement } = report;
  const strengths: PresenceInsights['strengths'] = [];
  const gaps: PresenceInsights['gaps'] = [];

  const verified = PLATFORM_IDS.filter((id) => {
    const p = platforms[id];
    return p && (p.status === 'ok' || (p.status === 'limited_data' && p.signals.profileExists));
  });

  if (verified.length > 0) {
    strengths.push({
      title: 'Profiles found',
      detail: `Verified on ${verified.map((id) => platformName(id)).join(', ')}.`,
    });
  }

  if (engagement.redditTopPosts.length > 0) {
    strengths.push({
      title: 'Active Reddit discussion',
      detail: `${engagement.redditTopPosts.length} notable threads; community buzz helps LLMs mention your brand.`,
    });
  }

  if (scores.community >= 25) {
    strengths.push({
      title: 'Strong community score',
      detail: 'Community & social dimension is a relative strength in this scan.',
    });
  }

  const unverified = PLATFORM_IDS.filter((id) => {
    const p = platforms[id];
    return p && (p.status === 'unreachable' || p.status === 'captcha_blocked');
  });
  if (unverified.length > 0) {
    gaps.push({
      title: 'Could not verify some platforms',
      detail: `${unverified.map((id) => platformName(id)).join(', ')} blocked or timed out during automated checks.`,
      suggestedAction: 'Retry later or verify those profiles manually and link them from your website.',
    });
  }

  if (scores.reviews < 20 && report.meta.searchPlan?.category !== 'b2b_saas') {
    const category = report.meta.searchPlan?.category;
    const skippedTrustpilot = report.meta.searchPlan?.skipPlatforms.some((s) => s.id === 'trustpilot');
    const isLocalService = category === 'local_service';

    gaps.push({
      title: 'Review-site dimension is low',
      detail: isLocalService
        ? 'Local service brands rarely appear on software review sites — focus on Google Business Profile, regional trade directories, and manufacturer dealer listings.'
        : skippedTrustpilot
          ? 'Review platforms were skipped for this brand type — prioritize industry-specific directories and verified local listings instead of generic review sites.'
          : 'For your brand type, software review sites may not apply — focus on Trustpilot and industry-specific directories instead.',
      suggestedAction: isLocalService
        ? 'Complete Google Business Profile, list on trade/industry directories, and link manufacturer authorisation pages from your site footer.'
        : skippedTrustpilot
          ? 'Add sameAs schema.org links for profiles you own (LinkedIn, regional directories, manufacturer pages).'
          : 'Claim Trustpilot and add sameAs links on your site footer.',
    });
  }

  if (scores.community < 18) {
    gaps.push({
      title: 'Community presence needs work',
      detail: 'Few high-engagement Reddit or Quora signals were detected.',
      suggestedAction:
        'Participate in relevant subreddits and answer category questions on Quora with expert, factual posts.',
    });
  }

  if (scores.media < 12) {
    gaps.push({
      title: 'Media & references are thin',
      detail: 'Limited news and authoritative off-site references for AI to cite.',
      suggestedAction:
        'Pursue earned media, ensure Wikipedia/notability where applicable, and get listed in industry publications.',
    });
  }

  const lowest =
    scores.reviews <= scores.community && scores.reviews <= scores.media
      ? 'reviews'
      : scores.community <= scores.media
        ? 'community'
        : 'media';

  const gettingStarted: PresenceInsights['gettingStarted'] = [
    {
      priority: 'high',
      title: 'This week',
      why: `Your lowest dimension is ${lowest} — start where AI visibility gains are largest.`,
      steps:
        lowest === 'community'
          ? [
              'Find 2–3 subreddits or forums where your audience discusses your category.',
              'Add links to official community profiles from your website footer or about page.',
              entity.needsReview
                ? `Confirm brand name "${entity.primaryBrand}" on your site matches how people search.`
                : 'Reply helpfully to one existing thread mentioning your brand (no spam).',
            ]
          : lowest === 'reviews'
            ? [
                'Claim or complete your Trustpilot profile and link it from your site.',
                'Add schema.org Organization sameAs URLs for profiles you own.',
              ]
            : [
                'Check if a Wikipedia or Wikidata entry exists; align your About page with notable facts.',
                'Pitch one industry publication or news outlet relevant to your category.',
              ],
    },
    {
      priority: 'medium',
      title: 'Next',
      why: 'Build consistent off-site signals across channels.',
      steps: [
        'Audit footer and About page for links to Reddit, Quora, Trustpilot, and social profiles.',
        searchSupplement?.queryCount
          ? `We ran ${searchSupplement.queryCount} web searches — address gaps in unverified platforms above.`
          : 'Re-run the probe after updating public profiles.',
        'Encourage customers to leave reviews on platforms that matter for your industry.',
      ],
    },
    {
      priority: 'low',
      title: 'Optional',
      why: 'Long-term GEO: stay visible where LLMs train and retrieve.',
      steps: [
        'Set AI_PROVIDER=minimax (or ollama) for adaptive search and hit curation on the next scan.',
        'Monitor top Reddit threads quarterly and keep answers accurate.',
        'Export this report JSON and track score changes over time.',
      ],
    },
  ];

  const category = report.meta.searchPlan?.category;
  const headline =
    scores.total >= 75
      ? `${entity.primaryBrand}: excellent off-site influence for AI citation`
      : scores.total >= 50
        ? `${entity.primaryBrand}: solid presence with room to grow`
        : `${entity.primaryBrand}: off-site influence needs attention`;

  const verdictParts: string[] = [];
  verdictParts.push(
    `${entity.primaryBrand} scores ${scores.total}/100 on off-site influence (${scores.band.replace(/_/g, ' ')}).`,
  );
  if (category) {
    verdictParts.push(
      `Scan tailored for ${category.replace(/_/g, ' ')} brands${report.meta.searchPlan?.skipPlatforms.length ? ` — skipped ${report.meta.searchPlan.skipPlatforms.map((s) => s.id).join(', ')} as not relevant` : ''}.`,
    );
  }
  if (scores.total < 50) {
    verdictParts.push(
      'Below 50, AI answers may rarely cite you as an off-site authority; follow the getting-started steps below.',
    );
  } else if (scores.total >= 50 && scores.total < 75) {
    verdictParts.push(
      'You have a credible footprint; doubling down on your weakest dimension (see breakdown) moves you toward excellent.',
    );
  } else {
    verdictParts.push(
      'Strong signals across checked channels — maintain profiles and community participation.',
    );
  }

  const topHits: { url: string; title?: string; platform?: string }[] = [];
  const seenHitUrl = new Set<string>();
  const pushHit = (url: string, title?: string, platform?: string) => {
    const key = url.trim().toLowerCase();
    if (!key || seenHitUrl.has(key)) return;
    seenHitUrl.add(key);
    topHits.push({ url, title, platform });
  };

  if (fullSupplement) {
    for (const s of fullSupplement.social) {
      pushHit(s.url, s.title, s.platform);
    }
    for (const h of fullSupplement.byPlatform.reddit ?? []) {
      pushHit(h.url, h.title, 'reddit');
    }
    for (const p of ['whirlpool', 'productreview', 'ozbargain'] as const) {
      for (const h of fullSupplement.byPlatform[p as PlatformId] ?? []) {
        pushHit(h.url, h.title, p);
      }
    }
    for (const h of fullSupplement.facebookPosts ?? []) {
      pushHit(h.url, h.title, 'facebook');
    }
    for (const [platform, hits] of Object.entries(fullSupplement.crossPlatformPosts ?? {})) {
      for (const h of hits ?? []) {
        pushHit(h.url, h.title, platform);
      }
    }
    for (const h of fullSupplement.byPlatform.quora ?? []) {
      pushHit(h.url, h.title, 'quora');
    }
    for (const hits of Object.values(fullSupplement.verticalHits ?? {})) {
      for (const h of hits) {
        pushHit(h.url, h.title, 'vertical');
      }
    }
  } else if (searchSupplement?.social) {
    for (const s of searchSupplement.social) {
      pushHit(s.url, s.title, s.platform);
    }
  }

  for (const p of engagement.redditDisplayPosts ?? []) {
    if (p.url) pushHit(p.url, p.title, 'reddit');
  }
  for (const p of engagement.facebookDisplayPosts ?? []) {
    if (p.url) pushHit(p.url, p.title, 'facebook');
  }
  for (const p of engagement.crossPlatformDisplayPosts ?? []) {
    if (p.url) pushHit(p.url, p.title, p.platform);
  }

  const quoraQuestions: { url: string; title?: string }[] = [];
  const quoraRaw = platforms.quora?.raw as
    | { topQuestions?: { title: string; url: string }[]; searchEvidence?: { url: string; title?: string }[] }
    | undefined;
  if (quoraRaw?.topQuestions) {
    for (const q of quoraRaw.topQuestions) {
      quoraQuestions.push({ url: q.url, title: q.title });
    }
  }
  const quoraEvidence = quoraRaw?.searchEvidence;
  if (Array.isArray(quoraEvidence)) {
    for (const e of quoraEvidence) {
      if (!quoraQuestions.some((q) => q.url === e.url)) {
        quoraQuestions.push({ url: e.url, title: e.title });
      }
    }
  }
  for (const hit of fullSupplement?.byPlatform.quora ?? []) {
    if (!quoraQuestions.some((q) => q.url === hit.url)) {
      quoraQuestions.push({ url: hit.url, title: hit.title });
    }
  }

  const trustpilot = platforms.trustpilot;
  const trustpilotSummary =
    trustpilot && (trustpilot.url || trustpilot.signals.rating != null)
      ? {
          url: trustpilot.url,
          rating: trustpilot.signals.rating,
          reviewCount: trustpilot.signals.reviewCount,
          unclaimed: trustpilot.signals.unclaimed,
        }
      : undefined;

  const verticalSources: {
    id: string;
    label: string;
    url: string;
    title?: string;
  }[] = [];
  if (fullSupplement?.verticalHits && report.meta.searchPlan?.additionalSources) {
    for (const src of report.meta.searchPlan.additionalSources) {
      const hits = fullSupplement.verticalHits[src.id];
      const best = hits?.[0];
      if (best) {
        verticalSources.push({
          id: src.id,
          label: src.label,
          url: best.url,
          title: best.title,
        });
      }
    }
  }

  return {
    headline,
    verdict: verdictParts.join(' '),
    strengths,
    gaps,
    gettingStarted,
    dimensions: {
      reviews: {
        score: scores.reviews,
        max: 40,
        ...dimensionNarrative('reviews', scores.reviews, 40, report),
      },
      community: {
        score: scores.community,
        max: 35,
        ...dimensionNarrative('community', scores.community, 35, report),
      },
      media: {
        score: scores.media,
        max: 25,
        ...dimensionNarrative('media', scores.media, 25, report),
      },
    },
    discoveries: {
      redditSubreddits: platforms.reddit?.subreddits?.slice(0, 8),
      socialProfiles: searchSupplement?.social,
      mediaDomains: searchSupplement?.offSiteDomains?.filter((d) =>
        /\.(com|co\.uk|org)$/i.test(d),
      ).slice(0, 12),
      topSearchHits: topHits.length > 0 ? topHits.slice(0, 40) : undefined,
      quoraQuestions: quoraQuestions.length > 0 ? quoraQuestions.slice(0, 8) : undefined,
      trustpilotSummary,
      verticalSources: verticalSources.length > 0 ? verticalSources : undefined,
    },
  };
}
