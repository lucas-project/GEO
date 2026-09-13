import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { extractChunks } from './chunks';
import { extractSchemas } from './schema';
import { extractQuestionHeadings } from './question-headings';
import { extractMediaSignals } from './media';

describe('extraction reliability fixtures', () => {
  it('extracts div-only content without duplicating wrapper text and counts CJK content', () => {
    const body = '这是足够长的中文内容，用于验证没有段落标签的页面也可以被稳定提取，并且中文字符会被计入内容长度。'.repeat(2);
    const $ = cheerio.load(`<main><div><div>${body}</div></div></main>`);
    const chunks = extractChunks($);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.wordCount).toBeGreaterThan(20);
  });

  it('preserves every type and nested JSON-LD entity', () => {
    const $ = cheerio.load('<script type="application/ld+json">{"@type":["Product","Thing"],"brand":{"@type":"Organization","name":"Acme"}}</script>');
    expect(extractSchemas($).map((block) => block.type)).toEqual(['Product', 'Thing', 'Organization']);
  });

  it('recognizes Chinese question headings and ignores explicitly decorative images', () => {
    expect(extractQuestionHeadings([{ level: 2, text: '如何选择合适的方案？' }])).toMatchObject({ questionHeadingCount: 1 });
    const $ = cheerio.load('<img src="hero.jpg" alt=""><img src="product.jpg" alt="产品照片">');
    expect(extractMediaSignals($)).toMatchObject({ imageCount: 2, imagesMissingAlt: 0, imagesWithGoodAlt: 0 });
  });
});
