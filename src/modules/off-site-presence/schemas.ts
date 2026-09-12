import { z } from 'zod';
import { PresenceSearchPlanSchema } from './search-plan-types';

export const PLATFORM_IDS = [
  'reddit',
  'quora',
  'g2',
  'capterra',
  'trustpilot',
  'site_search',
  'whirlpool',
  'productreview',
  'ozbargain',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const ProbeStatusSchema = z.enum([
  'ok',
  'limited_data',
  'captcha_blocked',
  'unreachable',
  'unclaimed',
  'skipped',
]);

export type ProbeStatus = z.infer<typeof ProbeStatusSchema>;

export const BrandEntityFlagsSchema = z.object({
  marketplaceMode: z.boolean(),
  ambiguousGeneric: z.boolean(),
  subBrands: z.array(z.string()),
});

export type BrandEntityFlags = z.infer<typeof BrandEntityFlagsSchema>;

export const BrandEntityResultSchema = z.object({
  primaryBrand: z.string(),
  aliases: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  sources: z.array(z.string()),
  flags: BrandEntityFlagsSchema,
  sameAsUrls: z.array(z.string()),
});

export type BrandEntityResult = z.infer<typeof BrandEntityResultSchema>;

export const DiscussionValueSignalsSchema = z.object({
  brand: z.number(),
  domain: z.number(),
  keywords: z.number(),
  engagement: z.number(),
  market: z.number(),
  recency: z.number(),
});

export type DiscussionValueSignals = z.infer<typeof DiscussionValueSignalsSchema>;

export const RedditPostSchema = z.object({
  title: z.string(),
  subreddit: z.string().optional(),
  upvotes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  awards: z.number().int().nonnegative().default(0),
  publishedAt: z.string().optional(),
  url: z.string().optional(),
  isComparison: z.boolean().optional(),
  category: z
    .enum(['product', 'sentiment', 'purchase', 'industry', 'other'])
    .optional(),
  engagementScore: z.number().optional(),
  valueScore: z.number().optional(),
  valueSignals: DiscussionValueSignalsSchema.optional(),
});

export type RedditPost = z.infer<typeof RedditPostSchema>;

export const FacebookPostSchema = RedditPostSchema.extend({
  platform: z.literal('facebook'),
  likes: z.number().int().nonnegative().default(0),
});

export type FacebookPost = z.infer<typeof FacebookPostSchema>;

export const CrossPlatformPostSchema = z.object({
  platform: z.string(),
  title: z.string(),
  url: z.string(),
  upvotes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  awards: z.number().int().nonnegative().default(0),
  publishedAt: z.string().optional(),
  valueScore: z.number().optional(),
  valueSignals: DiscussionValueSignalsSchema.optional(),
});

export type CrossPlatformPost = z.infer<typeof CrossPlatformPostSchema>;

export const AgentReachHealthSchema = z.object({
  xhs: z.enum(['ok', 'missing', 'auth', 'skipped']),
  rdt: z.enum(['ok', 'missing', 'auth', 'skipped']),
  jina: z.enum(['ok', 'skipped']),
  xhsHitsAdded: z.number().int().nonnegative().optional(),
  rdtHitsAdded: z.number().int().nonnegative().optional(),
  jinaEnriched: z.number().int().nonnegative().optional(),
});

export type AgentReachHealth = z.infer<typeof AgentReachHealthSchema>;

export const MarketCountrySchema = z.object({
  code: z.string(),
  name: z.string(),
  queryHint: z.string(),
  source: z.enum(['domain']),
});

export type ReportMarketCountry = z.infer<typeof MarketCountrySchema>;

export const PlatformSignalsSchema = z.object({
  profileExists: z.boolean().optional(),
  subscriberCount: z.number().int().nonnegative().optional(),
  postCount: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  rating: z.number().optional(),
  answerCount: z.number().int().nonnegative().optional(),
  highEngagementPostCount: z.number().int().nonnegative().optional(),
  searchHitEstimate: z.number().int().nonnegative().optional(),
  unclaimed: z.boolean().optional(),
  sameAsFallback: z.boolean().optional(),
});

export type PlatformSignals = z.infer<typeof PlatformSignalsSchema>;

export const PlatformProbeResultSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  status: ProbeStatusSchema,
  url: z.string().optional(),
  message: z.string().optional(),
  signals: PlatformSignalsSchema,
  raw: z.record(z.unknown()).optional(),
  posts: z.array(RedditPostSchema).optional(),
  subreddits: z.array(z.string()).optional(),
});

export type PlatformProbeResult = z.infer<typeof PlatformProbeResultSchema>;

export const InfluenceScoresSchema = z.object({
  total: z.number(),
  reviews: z.number(),
  community: z.number(),
  media: z.number(),
  band: z.enum(['needs_work', 'qualified', 'excellent']),
  raw: z
    .object({
      d3: z.number(),
      d4: z.number(),
      d5: z.number(),
    })
    .optional(),
});

export type InfluenceScores = z.infer<typeof InfluenceScoresSchema>;

const InsightBulletSchema = z.object({
  title: z.string(),
  detail: z.string(),
});

export const PresenceInsightsSchema = z.object({
  headline: z.string(),
  verdict: z.string(),
  strengths: z.array(InsightBulletSchema),
  gaps: z.array(
    InsightBulletSchema.extend({
      suggestedAction: z.string().optional(),
    }),
  ),
  gettingStarted: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      title: z.string(),
      why: z.string(),
      steps: z.array(z.string()),
    }),
  ),
  dimensions: z.object({
    reviews: z.object({
      score: z.number(),
      max: z.number(),
      narrative: z.string(),
      bullets: z.array(z.string()),
    }),
    community: z.object({
      score: z.number(),
      max: z.number(),
      narrative: z.string(),
      bullets: z.array(z.string()),
    }),
    media: z.object({
      score: z.number(),
      max: z.number(),
      narrative: z.string(),
      bullets: z.array(z.string()),
    }),
  }),
  discoveries: z.object({
    redditSubreddits: z.array(z.string()).optional(),
    socialProfiles: z
      .array(z.object({ platform: z.string(), url: z.string(), title: z.string().optional() }))
      .optional(),
    mediaDomains: z.array(z.string()).optional(),
    topSearchHits: z
      .array(
        z.object({
          url: z.string(),
          title: z.string().optional(),
          platform: z.string().optional(),
        }),
      )
      .optional(),
    quoraQuestions: z
      .array(z.object({ url: z.string(), title: z.string().optional() }))
      .optional(),
    trustpilotSummary: z
      .object({
        url: z.string().optional(),
        rating: z.number().optional(),
        reviewCount: z.number().optional(),
        unclaimed: z.boolean().optional(),
      })
      .optional(),
    verticalSources: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          url: z.string(),
          title: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

export type PresenceInsights = z.infer<typeof PresenceInsightsSchema>;

export const RecommendationSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  text: z.string(),
  category: z
    .enum(['community', 'reviews', 'media', 'website', 'entity', 'general'])
    .optional(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const OffSitePresenceReportSchema = z.object({
  meta: z.object({
    domain: z.string(),
    siteUrl: z.string(),
    scannedAt: z.string(),
    durationMs: z.number().int().nonnegative(),
    sources: z.array(z.enum(['playwright', 'serper', 'crawl', 'search', 'llm-search'])),
    playwrightEnabled: z.boolean(),
    searchPlan: PresenceSearchPlanSchema.optional(),
    marketCountry: MarketCountrySchema.optional(),
  }),
  entity: BrandEntityResultSchema,
  platforms: z.record(z.enum(PLATFORM_IDS), PlatformProbeResultSchema),
  engagement: z.object({
    redditTopPosts: z.array(RedditPostSchema),
    redditDisplayPosts: z.array(RedditPostSchema),
    redditDisplayTarget: z.number().int().positive().default(10),
    redditDisplayShortfall: z.number().int().nonnegative().default(0),
    redditHighEngagementCount: z.number().int().nonnegative(),
    facebookDisplayPosts: z.array(FacebookPostSchema).default([]),
    crossPlatformDisplayPosts: z.array(CrossPlatformPostSchema).default([]),
    crossPlatformDisplayTarget: z.number().int().positive().default(10),
    crossPlatformDisplayShortfall: z.number().int().nonnegative().default(0),
    agentReach: AgentReachHealthSchema.optional(),
  }),
  scores: InfluenceScoresSchema,
  insights: PresenceInsightsSchema.optional(),
  recommendations: z.array(RecommendationSchema),
  serperBoost: z
    .object({
      redditMentionEstimate: z.number().nullable(),
      mediaMentions: z.number(),
      verifiedPlatforms: z.array(z.string()),
    })
    .optional(),
  searchSupplement: z
    .object({
      queryCount: z.number().int().nonnegative(),
      social: z.array(
        z.object({
          platform: z.string(),
          url: z.string(),
          title: z.string().optional(),
        }),
      ),
      offSiteDomains: z.array(z.string()),
      curation: z
        .object({
          applied: z.boolean(),
          provider: z.string(),
          model: z.string(),
          kept: z.number().int().nonnegative(),
          rejected: z.number().int().nonnegative(),
        })
        .optional(),
      orchestration: z
        .object({
          roundsRun: z.number().int().nonnegative(),
          queriesAdded: z.number().int().nonnegative(),
          stoppedReason: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export type OffSitePresenceReport = z.infer<typeof OffSitePresenceReportSchema>;
