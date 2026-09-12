import type { CheerioAPI } from 'cheerio';

const GENERIC_ALT = /^(image|photo|picture|logo|icon|banner|img|spacer|placeholder|\d+)$/i;

export interface MediaSignals {
  imageCount: number;
  imagesWithGoodAlt: number;
  imagesMissingAlt: number;
  videoCount: number;
  videosWithTranscript: number;
}

export function extractMediaSignals($: CheerioAPI): MediaSignals {
  let imageCount = 0;
  let imagesWithGoodAlt = 0;
  let imagesMissingAlt = 0;
  let videoCount = 0;
  let videosWithTranscript = 0;

  $('img').each((_, el) => {
    const src = ($(el).attr('src') ?? '').trim();
    if (!src || src.startsWith('data:')) return;
    imageCount++;
    const alt = ($(el).attr('alt') ?? '').trim();
    if (!alt) {
      imagesMissingAlt++;
    } else if (alt.length >= 8 && !GENERIC_ALT.test(alt)) {
      imagesWithGoodAlt++;
    }
  });

  $('video').each((_, el) => {
    videoCount++;
    const track = $(el).find('track[kind="captions"], track[kind="subtitles"]').length > 0;
    const aria = ($(el).attr('aria-label') ?? '').trim().length > 20;
    const nearby = $(el).next('p, figcaption').text().trim().length > 40;
    if (track || aria || nearby) videosWithTranscript++;
  });

  return {
    imageCount,
    imagesWithGoodAlt,
    imagesMissingAlt,
    videoCount,
    videosWithTranscript,
  };
}
