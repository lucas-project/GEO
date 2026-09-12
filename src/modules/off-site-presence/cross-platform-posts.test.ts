import { describe, expect, it } from 'vitest';
import {
  isZhihuDiscussionUrl,
  isXiaohongshuNoteUrl,
  isAmazonReviewUrl,
  crossPlatformHitsToPosts,
} from './cross-platform-posts';

describe('cross-platform-posts', () => {
  it('classifies zhihu and xiaohongshu post URLs', () => {
    expect(isZhihuDiscussionUrl('https://www.zhihu.com/question/12345')).toBe(true);
    expect(isXiaohongshuNoteUrl('https://www.xiaohongshu.com/explore/abc123')).toBe(true);
    expect(isXiaohongshuNoteUrl('https://www.xiaohongshu.com/explore')).toBe(false);
    expect(isAmazonReviewUrl('https://www.amazon.com/product-reviews/B00TEST')).toBe(true);
  });

  it('converts supplement hits to posts', () => {
    const posts = crossPlatformHitsToPosts({
      zhihu: [
        {
          url: 'https://www.zhihu.com/question/1',
          title: 'What is Acme product quality?',
          engine: 'bing',
        },
      ],
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.platform).toBe('zhihu');
  });
});
