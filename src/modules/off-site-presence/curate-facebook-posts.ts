import type { FacebookPost } from './schemas';
import type { SearchPlanCategory } from './search-plan-types';
import type { MarketCountry } from './market-country';
import { curateDiscussionPostsForDisplay } from './curate-discussion-posts';

export async function curateFacebookPostsForDisplay(input: {
  brand: string;
  domain: string;
  siteKeywords: string[];
  brandAliases?: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  posts: FacebookPost[];
}): Promise<FacebookPost[]> {
  return curateDiscussionPostsForDisplay({
    platform: 'facebook',
    ...input,
  });
}
