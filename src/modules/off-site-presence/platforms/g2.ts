import * as cheerio from 'cheerio';
import type { PlatformProbeResult } from '../schemas';
import {
  detectCaptchaOrBlock,
  firstMatchingText,
  parseCount,
  parseRating,
} from './parse-helpers';
import { bestSupplementUrl } from '../supplement-helpers';
import type { ProbeContext } from './types';
import { isPlatformInProbePlan } from './types';

const G2_WAIT_SELECTOR = '.product-listing, [data-testid="product-card"], .product-card';

function parseG2Listing(html: string): {
  profileExists: boolean;
  rating?: number;
  reviewCount: number;
} {
  const $ = cheerio.load(html);
  const cards = $('.product-listing, [data-testid="product-card"], .product-card');
  const ratingText = firstMatchingText($, ['.rating', '[class*="star"]', '.fw-semibold']);
  const reviewText = firstMatchingText($, ['.review-count', '[class*="review"]']);
  return {
    profileExists: cards.length > 0 || /g2\.com\/products|g2\.com\/categories/i.test(html),
    rating: parseRating(ratingText ?? undefined),
    reviewCount: parseCount(reviewText ?? undefined) || cards.length,
  };
}

async function tryG2SupplementDeepFetch(
  ctx: ProbeContext,
  result: PlatformProbeResult,
): Promise<PlatformProbeResult> {
  if (!isPlatformInProbePlan(ctx, 'g2')) return result;
  const supplementUrl = bestSupplementUrl(ctx.searchSupplement ?? undefined, 'g2');
  if (!supplementUrl) return result;
  if (result.status === 'ok' && result.signals.profileExists) return result;

  try {
    const page = await ctx.fetchPage(supplementUrl, { waitForSelector: G2_WAIT_SELECTOR });
    if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) return result;
    const parsed = parseG2Listing(page.html);
    if (!parsed.profileExists && !/g2\.com\/products/i.test(page.html)) {
      return {
        ...result,
        status: 'limited_data',
        url: supplementUrl,
        message: 'Search supplement — G2 URL found',
        signals: { ...result.signals, profileExists: true },
        raw: {
          ...result.raw,
          fetchMethod: page.fetchMethod,
          searchEvidence: true,
        },
      };
    }
    return {
      platform: 'g2',
      status: 'ok',
      url: page.finalUrl,
      message: 'Search supplement — G2 profile',
      signals: {
        profileExists: true,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
      },
      raw: {
        fetchMethod: page.fetchMethod,
        searchEvidence: true,
      },
    };
  } catch {
    return result;
  }
}

export async function probeG2(ctx: ProbeContext): Promise<PlatformProbeResult> {
  if (!isPlatformInProbePlan(ctx, 'g2')) {
    const skip = ctx.searchPlan?.skipPlatforms.find((s) => s.id === 'g2');
    return {
      platform: 'g2',
      status: 'skipped',
      message: skip?.reason ?? 'Not relevant for this brand type',
      signals: {},
    };
  }
  const q = encodeURIComponent(ctx.brand.primaryBrand);
  const url = `https://www.g2.com/search?query=${q}`;

  try {
    const page = await ctx.fetchPage(url, { waitForSelector: G2_WAIT_SELECTOR });
    if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
      const sameAsG2 = ctx.sameAsUrls.some((u) => /g2\.com/i.test(u));
      return tryG2SupplementDeepFetch(ctx, {
        platform: 'g2',
        status: 'limited_data',
        url,
        message: 'G2 Cloudflare — sameAs fallback',
        signals: {
          profileExists: sameAsG2,
          sameAsFallback: sameAsG2,
          reviewCount: sameAsG2 ? 1 : 0,
        },
        raw: { fetchMethod: page.fetchMethod ?? 'playwright-stealth' },
      });
    }

    const parsed = parseG2Listing(page.html);
    const result: PlatformProbeResult = {
      platform: 'g2',
      status: parsed.profileExists ? 'ok' : 'limited_data',
      url: page.finalUrl,
      signals: {
        profileExists: parsed.profileExists,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
      },
      raw: page.fetchMethod ? { fetchMethod: page.fetchMethod } : undefined,
    };
    return tryG2SupplementDeepFetch(ctx, result);
  } catch {
    const sameAsG2 = ctx.sameAsUrls.some((u) => /g2\.com/i.test(u));
    return tryG2SupplementDeepFetch(ctx, {
      platform: 'g2',
      status: sameAsG2 ? 'limited_data' : 'unreachable',
      url,
      signals: { profileExists: sameAsG2, sameAsFallback: sameAsG2 },
    });
  }
}
