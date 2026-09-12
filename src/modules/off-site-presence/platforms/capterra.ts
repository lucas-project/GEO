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

const CAPTERRA_WAIT_SELECTOR = '[data-testid="product-card"], .ProductCard, article';

function parseCapterraListing(html: string): {
  profileExists: boolean;
  rating?: number;
  reviewCount: number;
} {
  const $ = cheerio.load(html);
  const cards = $('[data-testid="product-card"], .ProductCard, article');
  const ratingText = firstMatchingText($, ['[data-testid="rating"]', '.rating', '.stars']);
  const reviewText = firstMatchingText($, ['[data-testid="review-count"]', '.review-count']);
  return {
    profileExists:
      cards.length > 0 || /capterra\.com\/software|capterra\.com\/p\//i.test(html),
    rating: parseRating(ratingText ?? undefined),
    reviewCount: parseCount(reviewText ?? undefined) || Math.min(cards.length, 5),
  };
}

async function tryCapterraSupplement(
  ctx: ProbeContext,
  result: PlatformProbeResult,
): Promise<PlatformProbeResult> {
  if (!isPlatformInProbePlan(ctx, 'capterra')) return result;
  const supplementUrl = bestSupplementUrl(ctx.searchSupplement ?? undefined, 'capterra');
  if (!supplementUrl) return result;
  if (result.status === 'ok' && result.signals.profileExists) return result;

  try {
    const page = await ctx.fetchPage(supplementUrl, { waitForSelector: CAPTERRA_WAIT_SELECTOR });
    if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
      return {
        ...result,
        status: 'limited_data',
        url: supplementUrl,
        message: 'Search supplement — Capterra URL found',
        signals: { ...result.signals, profileExists: true },
        raw: { ...result.raw, searchEvidence: true },
      };
    }
    const parsed = parseCapterraListing(page.html);
    return {
      platform: 'capterra',
      status: parsed.profileExists ? 'ok' : 'limited_data',
      url: page.finalUrl,
      message: parsed.profileExists ? 'Search supplement — Capterra profile' : result.message,
      signals: {
        profileExists: parsed.profileExists || true,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
      },
      raw: { fetchMethod: page.fetchMethod, searchEvidence: true },
    };
  } catch {
    return result;
  }
}

export async function probeCapterra(ctx: ProbeContext): Promise<PlatformProbeResult> {
  if (!isPlatformInProbePlan(ctx, 'capterra')) {
    const skip = ctx.searchPlan?.skipPlatforms.find((s) => s.id === 'capterra');
    return {
      platform: 'capterra',
      status: 'skipped',
      message: skip?.reason ?? 'Not relevant for this brand type',
      signals: {},
    };
  }
  const q = encodeURIComponent(ctx.brand.primaryBrand);
  const url = `https://www.capterra.com/search/?search=${q}`;

  try {
    const page = await ctx.fetchPage(url, { waitForSelector: CAPTERRA_WAIT_SELECTOR });
    if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
      const sameAs = ctx.sameAsUrls.some((u) => /capterra\.com/i.test(u));
      return tryCapterraSupplement(ctx, {
        platform: 'capterra',
        status: 'limited_data',
        url,
        signals: { profileExists: sameAs, sameAsFallback: sameAs },
        raw: page.fetchMethod ? { fetchMethod: page.fetchMethod } : undefined,
      });
    }

    const parsed = parseCapterraListing(page.html);
    return tryCapterraSupplement(ctx, {
      platform: 'capterra',
      status: parsed.profileExists ? 'ok' : 'limited_data',
      url: page.finalUrl,
      signals: {
        profileExists: parsed.profileExists,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
      },
      raw: page.fetchMethod ? { fetchMethod: page.fetchMethod } : undefined,
    });
  } catch {
    return tryCapterraSupplement(ctx, {
      platform: 'capterra',
      status: 'unreachable',
      url,
      signals: {},
    });
  }
}
