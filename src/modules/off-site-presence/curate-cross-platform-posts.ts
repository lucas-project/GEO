import { curateDiscussionPostsForDisplay } from './curate-discussion-posts';
import type { CrossPlatformPost } from './schemas';
import type { SearchPlanCategory } from './search-plan-types';
import type { MarketCountry } from './market-country';

export async function curateCrossPlatformPostsForDisplay(input: {
  brand: string;
  domain: string;
  siteKeywords: string[];
  brandAliases?: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  posts: CrossPlatformPost[];
}): Promise<CrossPlatformPost[]> {
  if (!input.posts.length) return [];
  return curateDiscussionPostsForDisplay({
    platform: 'generic',
    brand: input.brand,
    domain: input.domain,
    siteKeywords: input.siteKeywords,
    brandAliases: input.brandAliases,
    searchPlanCategory: input.searchPlanCategory,
    searchPlanRationale: input.searchPlanRationale,
    marketCountry: input.marketCountry,
    posts: input.posts,
  });
}
