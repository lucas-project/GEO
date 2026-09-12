/**
 * Off-site presence probe — brand entity resolution, platform probes, influence scoring.
 * Playwright execution is server-only via `./server`.
 */

export type {
  BrandEntityResult,
  OffSitePresenceReport,
  PlatformId,
  PlatformProbeResult,
  ProbeStatus,
  RedditPost,
  FacebookPost,
  CrossPlatformPost,
  AgentReachHealth,
  InfluenceScores,
  Recommendation,
} from './schemas';

export {
  BrandEntityResultSchema,
  OffSitePresenceReportSchema,
  PLATFORM_IDS,
} from './schemas';

/** Client-safe report serialization (server assembly lives in `./server`). */
export { toJson, toMarkdown } from './report';
export type { PresenceInsights } from './schemas';
export type { PresenceSearchPlan, SearchPlanCategory } from './search-plan-types';
export type { SearchHit } from './search-engine';
export type { SearchSupplementResult } from './search-supplement';
export type { SerperBoostResult } from './serper-boost';
export type { ResolveEntityInput, EntityPageInput } from './resolve-entity';
