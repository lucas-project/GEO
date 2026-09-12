import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { parseCount } from './parse-helpers';

function parseRedditPostsFromFixture(html: string) {
  const $ = cheerio.load(html);
  const posts: { title: string; upvotes: number; comments: number }[] = [];
  $('[data-testid="post-container"]').each((_, el) => {
    const node = $(el);
    const title =
      node.find('[data-click-id="body"]').text().trim() ||
      node.find('h3').first().text().trim();
    const scoreText = node.find('[data-testid="vote-arrows"]').parent().text() || node.find('.score').text();
    const commentsText =
      node.find('[data-click-id="comments"]').text() ||
      node.find('a[href*="/comments/"]').last().text();
    posts.push({
      title,
      upvotes: parseCount(scoreText),
      comments: parseCount(commentsText),
    });
  });
  return posts;
}

describe('reddit parser fixture', () => {
  it('extracts posts from saved HTML', () => {
    const html = readFileSync(
      path.join(__dirname, '../__fixtures__/reddit-search.html'),
      'utf8',
    );
    const posts = parseRedditPostsFromFixture(html);
    expect(posts.length).toBe(2);
    expect(posts[0]?.title).toContain('Acme vs competitors');
    expect(posts[0]?.upvotes).toBeGreaterThan(0);
    expect(posts[0]?.comments).toBe(24);
  });
});
