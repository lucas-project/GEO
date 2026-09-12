import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import {
  curateRedditPostsForDisplay,
  fallbackKeywordFilter,
  minimalStructuralFilter,
} from './curate-reddit-posts';
import type { RedditPost } from './schemas';

const hvacKeywords = [
  'Split Systems',
  'Midea Air Conditioners',
  'HVAC Dealer',
];

const onTopic: RedditPost = {
  title: 'Our Midea Air Conditioners split install went well — dealer recommended',
  subreddit: 'HVAC',
  upvotes: 20,
  comments: 8,
  awards: 0,
  url: 'https://reddit.com/r/HVAC/comments/abc/midea-install',
};

const meidiBattlerap: RedditPost = {
  title: 'ROBSCURE vs MEIDI',
  subreddit: 'Battlerapde',
  upvotes: 64,
  comments: 26,
  awards: 0,
  url: 'https://reddit.com/r/Battlerapde/comments/meidi',
};

const celebrity: RedditPost = {
  title: 'Heidi Klum dressed up as a Worm for her Halloween Bash',
  subreddit: 'oddlyterrifying',
  upvotes: 4835,
  comments: 115,
  awards: 0,
  url: 'https://reddit.com/r/oddlyterrifying/comments/a',
};

describe('minimalStructuralFilter', () => {
  it('only removes empty and deleted titles', () => {
    const out = minimalStructuralFilter([
      onTopic,
      { ...meidiBattlerap, title: '[deleted]' },
      { ...onTopic, title: 'short', url: 'https://reddit.com/x' },
    ]);
    expect(out.map((p) => p.url)).toContain(onTopic.url);
    expect(out).toHaveLength(1);
  });
});

describe('fallbackKeywordFilter', () => {
  it('matches full brand or multi-word keyword phrases only', () => {
    const out = fallbackKeywordFilter(
      [onTopic, meidiBattlerap, celebrity],
      'MD Home',
      'mdhome.com.au',
      hvacKeywords,
    );
    expect(out.map((p) => p.url)).toEqual([onTopic.url]);
  });
});

describe('curateRedditPostsForDisplay (LLM-first)', () => {
  const originalProvider = config.ai.provider;

  beforeEach(() => {
    vi.restoreAllMocks();
    (config as { ai: { provider: string } }).ai.provider = 'ollama';
    (config.presenceProbe as { redditCurateEnabled: boolean }).redditCurateEnabled = true;
  });

  afterEach(() => {
    (config as { ai: { provider: string } }).ai.provider = originalProvider;
  });

  it('returns only URLs the LLM marks as keep (no regex re-validation)', async () => {
    vi.spyOn(ai, 'generateStructuredOutput').mockResolvedValue({
      data: {
        keep: [{ url: onTopic.url!, reason: 'HVAC install thread about Midea' }],
        reject: [{ url: meidiBattlerap.url!, reason: 'Battlerap homonym' }],
      },
      provider: 'mock',
      model: 'test',
    } as never);

    const result = await curateRedditPostsForDisplay({
      brand: 'MD Home',
      domain: 'mdhome.com.au',
      siteKeywords: hvacKeywords,
      brandAliases: ['md home'],
      searchPlanCategory: 'local_service',
      posts: [onTopic, meidiBattlerap, celebrity],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe(onTopic.url);
  });

  it('trusts LLM to reject homonym thread when LLM returns empty keep', async () => {
    vi.spyOn(ai, 'generateStructuredOutput').mockResolvedValue({
      data: {
        keep: [],
        reject: [{ url: meidiBattlerap.url!, reason: 'Not about target brand' }],
      },
      provider: 'mock',
      model: 'test',
    } as never);

    const result = await curateRedditPostsForDisplay({
      brand: 'MD Home',
      domain: 'mdhome.com.au',
      siteKeywords: hvacKeywords,
      posts: [meidiBattlerap],
    });

    expect(result).toHaveLength(0);
  });

  it('sends all structural candidates to LLM including previously heuristic-rejected posts', async () => {
    const gen = vi.spyOn(ai, 'generateStructuredOutput').mockResolvedValue({
      data: { keep: [], reject: [] },
      provider: 'mock',
      model: 'test',
    } as never);

    await curateRedditPostsForDisplay({
      brand: 'Acme Corp',
      domain: 'acme.com',
      siteKeywords: ['enterprise software'],
      posts: [celebrity, meidiBattlerap],
    });

    const prompt = gen.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain('ROBSCURE vs MEIDI');
    expect(prompt).toContain('Heidi Klum');
  });
});
