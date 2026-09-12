import * as cheerio from 'cheerio';
import { fetchOffSiteHttp } from '../fetch-off-site-page';
import type { PlatformProbeResult } from '../schemas';
import {
  detectCaptchaOrBlock,
  firstMatchingText,
  parseCount,
  parseRating,
} from './parse-helpers';
import { bestSupplementUrl } from '../supplement-helpers';
import type { ProbeContext } from './types';

const MIN_HTTP_BODY = 2000;
const TRUSTPILOT_WAIT_SELECTOR =
  '[data-reviews-count-typography], span[data-reviews-count], .reviews-count';

function parseTrustpilot(html: string): {
  rating?: number;
  reviewCount: number;
  unclaimed: boolean;
} {
  const $ = cheerio.load(html);
  const ratingText = firstMatchingText($, [
    '[data-rating]',
    '.typography_display-lg',
    'p[data-rating-typography]',
    '.star-rating',
  ]);
  const reviewText = firstMatchingText($, [
    '[data-reviews-count-typography]',
    'span[data-reviews-count]',
    '.reviews-count',
  ]);
  const unclaimed =
    /unclaimed|claim this business|be the first to review/i.test(html) ||
    reviewText === '0' ||
    !reviewText;

  return {
    rating: parseRating(ratingText ?? undefined),
    reviewCount: parseCount(reviewText ?? undefined),
    unclaimed,
  };
}

function trustpilotResult(
  parsed: ReturnType<typeof parseTrustpilot>,
  pageUrl: string,
  fetchMethod: string | undefined,
  message?: string,
): PlatformProbeResult {
  return {
    platform: 'trustpilot',
    status: parsed.unclaimed ? 'unclaimed' : 'ok',
    url: pageUrl,
    signals: {
      profileExists: !parsed.unclaimed,
      rating: parsed.rating,
      reviewCount: parsed.reviewCount,
      unclaimed: parsed.unclaimed,
    },
    message: message ?? (parsed.unclaimed ? 'Profile unclaimed or no reviews' : undefined),
    raw: fetchMethod ? { fetchMethod } : undefined,
  };
}

export async function probeTrustpilot(ctx: ProbeContext): Promise<PlatformProbeResult> {
  const url = `https://www.trustpilot.com/review/${ctx.domain}`;
  let fetchMethod: string | undefined;
  let domainMissing = false;

  try {
    const httpPage = await fetchOffSiteHttp(url);
    fetchMethod = 'http';

    if (
      httpPage.statusCode < 400 &&
      httpPage.html.length >= MIN_HTTP_BODY &&
      !detectCaptchaOrBlock(httpPage.html, null, httpPage.statusCode)
    ) {
      if (httpPage.statusCode !== 404) {
        const parsed = parseTrustpilot(httpPage.html);
        return trustpilotResult(parsed, httpPage.finalUrl, fetchMethod);
      }
      domainMissing = true;
    } else {
      const page = await ctx.fetchPage(url, { waitForSelector: TRUSTPILOT_WAIT_SELECTOR });
      fetchMethod = page.fetchMethod ?? 'playwright-stealth';

      if (page.statusCode === 404) {
        domainMissing = true;
      } else if (!detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
        const parsed = parseTrustpilot(page.html);
        return trustpilotResult(parsed, page.finalUrl, fetchMethod);
      }
    }
  } catch {
    /* try supplement */
  }

  const supplementUrl = bestSupplementUrl(ctx.searchSupplement ?? undefined, 'trustpilot');
  if (supplementUrl) {
    try {
      const page = await ctx.fetchPage(supplementUrl, {
        waitForSelector: TRUSTPILOT_WAIT_SELECTOR,
      });
      if (!detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
        const parsed = parseTrustpilot(page.html);
        const result = trustpilotResult(
          parsed,
          page.finalUrl,
          page.fetchMethod,
          'Search supplement — Trustpilot profile',
        );
        result.raw = { fetchMethod: page.fetchMethod, searchEvidence: true };
        return result;
      }
    } catch {
      /* fall through */
    }
  }

  if (domainMissing) {
    return {
      platform: 'trustpilot',
      status: 'unclaimed',
      url,
      message: 'No Trustpilot profile found — consider claiming',
      signals: { profileExists: false, unclaimed: true },
      raw: fetchMethod ? { fetchMethod } : undefined,
    };
  }

  return {
    platform: 'trustpilot',
    status: 'unreachable',
    url,
    signals: {},
    raw: fetchMethod ? { fetchMethod } : undefined,
  };
}
