import { describe, expect, it, vi } from 'vitest';
import { runQueryDefSearch } from './targeted-search';
import * as redditJson from './platforms/reddit-json';
import * as searchEngine from './search-engine';
import type { FetchPageFn } from './platforms/types';

describe('runQueryDefSearch', () => {
  it('uses Reddit JSON API for reddit target without SERP', async () => {
    vi.spyOn(redditJson, 'fetchRedditSearchPosts').mockResolvedValue([
      {
        title: 'Ferrari launch thread',
        subreddit: 'ferrari',
        upvotes: 100,
        comments: 10,
        awards: 0,
        url: 'https://www.reddit.com/r/ferrari/comments/abc/test',
      },
    ]);
    const serp = vi.spyOn(searchEngine, 'runBingDdgSearch');

    const { hits, engine } = await runQueryDefSearch(
      {
        key: 'reddit',
        target: 'reddit',
        build: () => '"Ferrari" site:reddit.com',
      },
      'Ferrari',
      'ferrari.com',
      vi.fn() as FetchPageFn,
    );

    expect(engine).toBe('reddit-json');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.url).toContain('reddit.com');
    expect(serp).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('uses Bing-only SERP for quora target', async () => {
    vi.spyOn(redditJson, 'fetchRedditSearchPosts').mockRestore();
    const serp = vi.spyOn(searchEngine, 'runBingDdgSearch').mockResolvedValue({
      hits: [{ url: 'https://www.quora.com/q/ferrari', engine: 'bing' }],
      engine: 'bing',
    });

    await runQueryDefSearch(
      {
        key: 'quora',
        target: 'quora',
        build: () => '"Ferrari" site:quora.com',
      },
      'Ferrari',
      'ferrari.com',
      vi.fn() as FetchPageFn,
    );

    expect(serp).toHaveBeenCalledWith(
      expect.stringContaining('site:quora.com'),
      expect.any(Function),
      expect.objectContaining({ httpOnly: true, engines: ['bing', 'duckduckgo'] }),
    );
    vi.restoreAllMocks();
  });
});
