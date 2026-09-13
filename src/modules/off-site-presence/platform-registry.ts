import type { PlatformId } from './schemas';
import type { PresenceSearchPlan } from './search-plan-types';

export const UNIVERSAL_SEARCH_TARGETS = ['reddit', 'general', 'news'] as const;
export type UniversalSearchTarget = (typeof UNIVERSAL_SEARCH_TARGETS)[number];

export const UNIVERSAL_PROBE_IDS = ['reddit', 'quora', 'site_search'] as PlatformId[];

export const SOCIAL_SEARCH_KEYS = ['facebook', 'linkedin', 'youtube', 'instagram', 'x'] as const;
export type SocialSearchKey = (typeof SOCIAL_SEARCH_KEYS)[number];

export const CONDITIONAL_PROBE_PLATFORMS: PlatformId[] = [
  'g2',
  'capterra',
  'trustpilot',
  'whirlpool',
  'productreview',
  'ozbargain',
];

export type SearchPlanCategory =
  | 'automotive'
  | 'b2b_saas'
  | 'consumer_brand'
  | 'marketplace'
  | 'local_service'
  | 'generic';

const CATEGORY_PROBE_PLATFORMS: Record<SearchPlanCategory, PlatformId[]> = {
  automotive: ['reddit', 'quora', 'trustpilot', 'site_search'],
  b2b_saas: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'site_search'],
  consumer_brand: ['reddit', 'quora', 'trustpilot', 'site_search'],
  marketplace: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'site_search'],
  local_service: ['reddit', 'quora', 'site_search'],
  generic: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'site_search'],
};

const CATEGORY_SEARCH_TARGETS: Record<
  SearchPlanCategory,
  Array<PlatformId | UniversalSearchTarget | 'social'>
> = {
  automotive: ['reddit', 'quora', 'trustpilot', 'general', 'news', 'social'],
  b2b_saas: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'general', 'news', 'social'],
  consumer_brand: ['reddit', 'quora', 'trustpilot', 'general', 'news', 'social'],
  marketplace: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'general', 'news', 'social'],
  local_service: ['reddit', 'general', 'news', 'social'],
  generic: ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'general', 'news', 'social'],
};

const CATEGORY_SKIP: Record<SearchPlanCategory, Array<{ id: string; reason: string }>> = {
  automotive: [
    { id: 'g2', reason: 'B2B software review site — not relevant for automotive brands' },
    { id: 'capterra', reason: 'B2B software review site — not relevant for automotive brands' },
  ],
  b2b_saas: [],
  consumer_brand: [
    { id: 'g2', reason: 'B2B software reviews rarely apply to consumer brands' },
    { id: 'capterra', reason: 'B2B software reviews rarely apply to consumer brands' },
  ],
  marketplace: [],
  local_service: [
    { id: 'g2', reason: 'B2B software reviews do not apply to local installers and dealers' },
    { id: 'capterra', reason: 'B2B software reviews do not apply to local installers and dealers' },
    {
      id: 'trustpilot',
      reason: 'National product review sites are low-signal for local HVAC/installer dealers',
    },
  ],
  generic: [],
};

export function platformsForCategory(category: SearchPlanCategory, domain?: string): PlatformId[] {
  const platforms = [...CATEGORY_PROBE_PLATFORMS[category]];
  if (domain && domain.replace(/^www\./, '').endsWith('.au')) {
    const au: PlatformId[] = ['whirlpool', 'productreview', 'ozbargain'];
    const withoutReddit = platforms.filter((p) => p !== 'reddit');
    return [...new Set([...au, ...withoutReddit, 'reddit'])] as PlatformId[];
  }
  return [...new Set(platforms)] as PlatformId[];
}

export function searchTargetsForCategory(
  category: SearchPlanCategory,
  domain?: string,
): Array<PlatformId | UniversalSearchTarget | 'social'> {
  const targets = [...CATEGORY_SEARCH_TARGETS[category]];
  if (domain && domain.endsWith('.au')) {
    targets.push('whirlpool', 'productreview', 'ozbargain');
  }
  return [...new Set(targets)] as Array<PlatformId | UniversalSearchTarget | 'social'>;
}

export function skipPlatformsForCategory(
  category: SearchPlanCategory,
): Array<{ id: string; reason: string }> {
  return [...CATEGORY_SKIP[category]];
}

export function isProbeInPlan(plan: PresenceSearchPlan, platformId: PlatformId): boolean {
  return plan.probePlatforms.includes(platformId);
}

export function isSearchTargetInPlan(
  plan: PresenceSearchPlan,
  target: PlatformId | UniversalSearchTarget | 'social',
): boolean {
  return plan.searchTargets.includes(target);
}

export function plannedProbedPlatformIds(plan: PresenceSearchPlan): PlatformId[] {
  return CONDITIONAL_PROBE_PLATFORMS.filter((id) => plan.probePlatforms.includes(id));
}

/** Platforms that receive site: SERP queries in the search supplement. */
export function plannedSearchPlatformIds(plan: PresenceSearchPlan): PlatformId[] {
  const searchIds: PlatformId[] = ['reddit', 'quora', 'g2', 'capterra', 'trustpilot', 'whirlpool', 'productreview', 'ozbargain'];
  return searchIds.filter((id) => plan.searchTargets.includes(id));
}

export function allProbePlatformIds(): PlatformId[] {
  return [...UNIVERSAL_PROBE_IDS, ...CONDITIONAL_PROBE_PLATFORMS.filter((id) => id !== 'site_search')];
}
