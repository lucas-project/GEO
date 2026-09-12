import type { BrandEntityResult, PlatformId, PlatformProbeResult } from '../schemas';
import type { SearchSupplementResult } from '../search-supplement';
import type { PresenceSearchPlan } from '../search-plan-types';

export type OffSiteFetchMethod =
  | 'http'
  | 'playwright-stealth'
  | 'playwright-cloak'
  | 'playwright-headed';

export interface FetchPageOptions {
  waitForSelector?: string;
  /** Set false for Reddit URLs so images/fonts load (link.md part 2). */
  blockHeavyResources?: boolean;
}

export interface FetchedPage {
  html: string;
  statusCode: number;
  finalUrl: string;
  fetchMethod?: OffSiteFetchMethod;
  title?: string | null;
}

export type FetchPageFn = (url: string, options?: FetchPageOptions) => Promise<FetchedPage>;

export interface ProbeContext {
  brand: BrandEntityResult;
  domain: string;
  siteUrl: string;
  fetchPage: FetchPageFn;
  sameAsUrls: string[];
  searchSupplement?: SearchSupplementResult | null;
  searchPlan?: PresenceSearchPlan;
}

export function isPlatformInProbePlan(ctx: ProbeContext, platformId: PlatformId): boolean {
  if (!ctx.searchPlan) return true;
  return ctx.searchPlan.probePlatforms.includes(platformId);
}

export interface OffSitePlatformAdapter {
  id: PlatformProbeResult['platform'];
  probe(ctx: ProbeContext): Promise<PlatformProbeResult>;
}
