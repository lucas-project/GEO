import * as cheerio from 'cheerio';
import { slugifyBrand } from '../aliases';
import { fetchOffSiteHttp } from '../fetch-off-site-page';
import type { PlatformProbeResult } from '../schemas';
import type { SearchHit } from '../search-engine';
import {
  detectCaptchaOrBlock,
  detectLoginWall,
  parseCount,
} from './parse-helpers';
import { bestSupplementUrl } from '../supplement-helpers';
import type { ProbeContext } from './types';

function parseQuoraQuestions(html: string): {
  count: number;
  totalAnswers: number;
  topQuestions: { title: string; url: string }[];
} {
  const $ = cheerio.load(html);
  let count = 0;
  let totalAnswers = 0;
  const topQuestions: { title: string; url: string }[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="/question/"]').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || title.length < 8) return;
    const url = href.startsWith('http') ? href : `https://www.quora.com${href}`;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    if (topQuestions.length < 5) {
      topQuestions.push({ title: title.slice(0, 160), url });
    }
  });

  const selectors = ['.q-box', '.qu-borderAll', '[class*="Question"]', 'a[href*="/question/"]'];
  for (const sel of selectors) {
    const nodes = $(sel);
    if (nodes.length > 0) {
      count = Math.max(count, nodes.length);
      nodes.each((_, el) => {
        const text = $(el).text();
        const answers = parseCount(/([\d,]+)\s+answers?/i.exec(text)?.[1]);
        totalAnswers += answers;
      });
      break;
    }
  }

  if (count === 0 && topQuestions.length > 0) count = topQuestions.length;

  return { count, totalAnswers, topQuestions };
}

function quoraResultFromSearchHits(hits: SearchHit[]): PlatformProbeResult {
  const url = hits[0]?.url ?? 'https://www.quora.com';
  const topQuestions = hits
    .filter((h) => /\/question\/|\/q\//i.test(h.url))
    .slice(0, 5)
    .map((h) => ({
      title: (h.title ?? h.url).replace(/\s+/g, ' ').trim().slice(0, 160),
      url: h.url,
    }));

  return {
    platform: 'quora',
    status: 'limited_data',
    url,
    message: 'From web search',
    signals: {
      profileExists: true,
      postCount: hits.length,
      answerCount: topQuestions.length,
    },
    raw: {
      searchEvidence: true,
      fetchMethod: 'http',
      ...(topQuestions.length > 0 ? { topQuestions } : {}),
    },
  };
}

export async function probeQuora(ctx: ProbeContext): Promise<PlatformProbeResult> {
  const supplementHits = ctx.searchSupplement?.byPlatform.quora ?? [];
  if (supplementHits.length > 0) {
    return quoraResultFromSearchHits(supplementHits);
  }

  const slug = slugifyBrand(ctx.brand.primaryBrand);
  const q = encodeURIComponent(ctx.brand.primaryBrand);

  let status: PlatformProbeResult['status'] = 'unreachable';
  let profileExists = false;
  let answerCount = 0;
  let url = `https://www.quora.com/topic/${slug}`;
  let topQuestions: { title: string; url: string }[] = [];

  try {
    const topicPage = await fetchOffSiteHttp(url);
    if (detectCaptchaOrBlock(topicPage.html, topicPage.title ?? null, topicPage.statusCode)) {
      return {
        platform: 'quora',
        status: 'captcha_blocked',
        url,
        message: 'Quora blocked automated access',
        signals: {},
        raw: { fetchMethod: 'http' },
      };
    }
    if (detectLoginWall(topicPage.html)) {
      status = 'limited_data';
    } else if (topicPage.statusCode < 400) {
      profileExists = !/not found|404/i.test(topicPage.html.slice(0, 5000));
      status = profileExists ? 'ok' : 'limited_data';
    }
  } catch {
    /* continue to search */
  }

  try {
    const searchPage = await fetchOffSiteHttp(
      `https://www.quora.com/search?q=${q}&type=question`,
    );
    if (detectLoginWall(searchPage.html)) {
      status = 'limited_data';
    } else if (
      !detectCaptchaOrBlock(searchPage.html, searchPage.title ?? null, searchPage.statusCode)
    ) {
      const parsed = parseQuoraQuestions(searchPage.html);
      answerCount = parsed.totalAnswers;
      topQuestions = parsed.topQuestions;
      if (parsed.count > 0) status = status === 'unreachable' ? 'limited_data' : 'ok';
      url = searchPage.finalUrl;
    }
  } catch {
    /* keep prior status */
  }

  let result: PlatformProbeResult = {
    platform: 'quora',
    status,
    url,
    signals: {
      profileExists,
      answerCount,
      postCount: answerCount > 0 ? answerCount : undefined,
    },
    message: status === 'limited_data' ? 'Login wall — partial data only' : undefined,
    raw: {
      fetchMethod: 'http',
      ...(topQuestions.length > 0 ? { topQuestions } : {}),
    },
  };

  const supplementUrl = bestSupplementUrl(ctx.searchSupplement ?? undefined, 'quora');
  if (
    supplementUrl &&
    (result.status === 'unreachable' ||
      result.status === 'captcha_blocked' ||
      !result.signals.profileExists)
  ) {
    try {
      const page = await fetchOffSiteHttp(supplementUrl);
      if (!detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) {
        const topicExists = !/not found|404/i.test(page.html.slice(0, 5000));
        if (topicExists) {
          result = {
            platform: 'quora',
            status: 'limited_data',
            url: supplementUrl,
            message: 'Search supplement — Quora profile',
            signals: { profileExists: true, answerCount },
            raw: { fetchMethod: 'http', searchEvidence: true },
          };
        }
      }
    } catch {
      /* keep prior */
    }
  }

  return result;
}
