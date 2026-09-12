import type { RedditPost } from './schemas';
import type { SearchPlanCategory } from './search-plan-types';
import type { MarketCountry } from './market-country';
import {
  curateDiscussionPostsForDisplay,
  fallbackKeywordFilter,
  minimalStructuralFilter,
  shouldCurateDiscussionPosts,
} from './curate-discussion-posts';

export { fallbackKeywordFilter, minimalStructuralFilter };
export const shouldCurateRedditPosts = shouldCurateDiscussionPosts;

export async function curateRedditPostsForDisplay(input: {
  brand: string;
  domain: string;
  siteKeywords: string[];
  brandAliases?: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  posts: RedditPost[];
}): Promise<RedditPost[]> {
  return curateDiscussionPostsForDisplay({
    platform: 'reddit',
    ...input,
  });
}
