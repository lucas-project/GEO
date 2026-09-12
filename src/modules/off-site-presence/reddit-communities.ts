import type { RedditPost } from './schemas';
import type { SearchPlanCategory } from './search-plan-types';
import { slugifyBrand } from './aliases';

/** Reddit global nav / sidebar — not brand communities. */
export const GLOBAL_NOISE_SUBREDDITS = new Set([
  'popular',
  'all',
  'askreddit',
  'pics',
  'funny',
  'gaming',
  'worldnews',
  'news',
  'todayilearned',
  'nottheonion',
  'explainlikeimfive',
  'mildlyinteresting',
  'diy',
  'videos',
  'oldschoolcool',
  'twoxchromosomes',
  'tifu',
  'music',
  'books',
  'lifeprotips',
  'dataisbeautiful',
  'aww',
  'science',
  'space',
  'showerthoughts',
  'askscience',
  'jokes',
  'art',
  'iama',
  'futurology',
  'sports',
  'upliftingnews',
  'food',
  'nosleep',
  'creepy',
  'history',
  'gifs',
  'internetisbeautiful',
  'getmotivated',
  'gadgets',
  'announcements',
  'writingprompts',
  'philosophy',
  'documentaries',
  'earthporn',
  'photoshopbattles',
  'listentothis',
  'blog',
]);

const LOCAL_SERVICE_SUBREDDIT_ALLOW = new Set([
  'hvac',
  'hvacadvice',
  'homeowners',
  'homeimprovement',
  'heatpumps',
  'airconditioning',
  'construction',
  'appliances',
]);

export function isNoiseSubreddit(name: string): boolean {
  const n = name.toLowerCase().replace(/^u_/, '');
  if (GLOBAL_NOISE_SUBREDDITS.has(n)) return true;
  if (/^u_/.test(name)) return true;
  return false;
}

export function uniqueSubredditsFromPosts(posts: RedditPost[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of posts) {
    const s = p.subreddit?.trim();
    if (!s || isNoiseSubreddit(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function filterRelevantSubreddits(
  names: string[],
  brand: string,
  keywords: string[],
  category?: SearchPlanCategory,
): string[] {
  const slug = slugifyBrand(brand);
  const keywordTokens = new Set<string>();
  for (const k of keywords) {
    for (const w of k.toLowerCase().split(/\s+/)) {
      if (w.length >= 3) keywordTokens.add(w.replace(/s$/, ''));
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const name = raw.trim();
    if (!name || isNoiseSubreddit(name)) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;

    if (slug && lower === slug) {
      seen.add(lower);
      out.push(name);
      continue;
    }

    let relevant = false;
    for (const tok of keywordTokens) {
      if (tok.length >= 4 && lower.includes(tok)) {
        relevant = true;
        break;
      }
    }

    if (!relevant && category === 'local_service' && LOCAL_SERVICE_SUBREDDIT_ALLOW.has(lower)) {
      relevant = true;
    }

    if (relevant) {
      seen.add(lower);
      out.push(name);
    }
  }

  return out.slice(0, 8);
}

export function sanitizeParsedCommunities(names: string[]): string[] {
  return names.filter((n) => !isNoiseSubreddit(n));
}
