import { z } from 'zod';
import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { CrossPlatformPost, FacebookPost, RedditPost } from './schemas';
import type { SearchPlanCategory } from './search-plan-types';
import type { MarketCountry } from './market-country';
import type { DiscussionPlatform } from './discussion-value-score';
import { resolvePresenceModel } from './model';
import {
  DISCUSSION_CURATION_SYSTEM,
  buildDiscussionCurationPrompt,
} from './prompts/discussion-curation';

const MAX_LLM_CANDIDATES = 50;
const MAX_KEPT = 15;

const DiscussionCurationSchema = z.object({
  keep: z.array(z.object({ url: z.string(), reason: z.string() })),
  reject: z.array(z.object({ url: z.string(), reason: z.string() })),
});

const MultiDiscussionCurationSchema = z.object({
  reddit: DiscussionCurationSchema.optional(),
  facebook: DiscussionCurationSchema.optional(),
  generic: DiscussionCurationSchema.optional(),
});

type DiscussionPost = RedditPost | FacebookPost | CrossPlatformPost;

export function minimalStructuralFilter(posts: DiscussionPost[]): DiscussionPost[] {
  return posts.filter((p) => {
    const title = p.title?.trim() ?? '';
    if (title.length < 12) return false;
    if (/^\[deleted\]$/i.test(title)) return false;
    return true;
  });
}

export function fallbackKeywordFilter(
  posts: DiscussionPost[],
  brand: string,
  domain: string,
  siteKeywords: string[],
  options?: { loose?: boolean },
): DiscussionPost[] {
  if (options?.loose) {
    return posts.slice(0, MAX_KEPT);
  }
  const brandNorm = brand.trim().toLowerCase();
  const domainStem = domain.replace(/^www\./, '').split('.')[0]?.toLowerCase() ?? '';

  return posts.filter((p) => {
    const t = p.title.toLowerCase();
    if (brandNorm.length >= 3 && t.includes(brandNorm)) return true;
    if (domainStem.length >= 4 && t.includes(domainStem)) return true;
    for (const kw of siteKeywords) {
      const phrase = kw.trim().toLowerCase();
      if (phrase.length < 4) continue;
      if (phrase.includes(' ') && t.includes(phrase)) return true;
      if (!phrase.includes(' ') && phrase.length >= 8 && t.includes(phrase)) return true;
    }
    return false;
  });
}

export function shouldCurateDiscussionPosts(): boolean {
  return config.presenceProbe.redditCurateEnabled && config.ai.provider !== 'mock';
}

function findPostForKeepUrl<T extends DiscussionPost>(
  keepUrl: string,
  postByUrl: Map<string, T>,
  candidates: T[],
): T | undefined {
  const key = keepUrl.trim().toLowerCase();
  if (!key) return undefined;
  const direct = postByUrl.get(key);
  if (direct) return direct;
  try {
    const keepPath = new URL(key.startsWith('http') ? key : `https://${key}`).pathname.toLowerCase();
    for (const p of candidates) {
      if (!p.url) continue;
      try {
        if (new URL(p.url).pathname.toLowerCase() === keepPath) return p;
      } catch {
        continue;
      }
    }
  } catch {
    for (const p of candidates) {
      if (p.url && key.includes(p.url.toLowerCase())) return p;
      if (p.url && p.url.toLowerCase().includes(key)) return p;
    }
  }
  return undefined;
}

function applyLlmKeeps<T extends DiscussionPost>(
  keep: Array<{ url: string; reason: string }>,
  postByUrl: Map<string, T>,
  candidates: T[],
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const k of keep) {
    const post = findPostForKeepUrl(k.url, postByUrl, candidates);
    if (!post) continue;
    const dedupe = post.url?.trim().toLowerCase() ?? post.title.trim().toLowerCase();
    if (!dedupe || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(post);
    if (out.length >= MAX_KEPT) break;
  }
  return out;
}

export async function curateDiscussionPostsForDisplay<T extends DiscussionPost>(input: {
  platform: DiscussionPlatform;
  brand: string;
  domain: string;
  siteKeywords: string[];
  brandAliases?: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  posts: T[];
}): Promise<T[]> {
  if (!input.posts.length) return [];

  const { brand, domain, siteKeywords, platform } = input;
  const aliases = input.brandAliases ?? [];
  const structural = minimalStructuralFilter(input.posts);

  const looseFallback = platform === 'generic';

  if (!shouldCurateDiscussionPosts()) {
    logger.info(`${platform} LLM curation disabled — using keyword fallback`);
    return fallbackKeywordFilter(structural, brand, domain, siteKeywords, {
      loose: looseFallback,
    }).slice(0, MAX_KEPT) as T[];
  }

  const candidates = structural.slice(0, MAX_LLM_CANDIDATES);
  if (candidates.length === 0) return [];

  const postByUrl = new Map(
    candidates
      .filter((p) => p.url)
      .map((p) => [p.url!.trim().toLowerCase(), p] as const),
  );

  try {
    const presenceModel = resolvePresenceModel(ai.name);
    const { data } = await ai.generateStructuredOutput({
      schema: DiscussionCurationSchema,
      schemaName: 'DiscussionCuration',
      system: DISCUSSION_CURATION_SYSTEM,
      prompt: buildDiscussionCurationPrompt({
        platform,
        brand,
        domain,
        aliases,
        siteKeywords,
        searchPlanCategory: input.searchPlanCategory,
        searchPlanRationale: input.searchPlanRationale,
        marketCountry: input.marketCountry,
        posts: candidates,
      }),
      temperature: 0.1,
      ...(presenceModel ? { model: presenceModel } : {}),
    });

    const kept = applyLlmKeeps(data.keep, postByUrl, candidates);
    logger.info(
      {
        platform,
        candidates: candidates.length,
        kept: kept.length,
        rejected: data.reject.length,
      },
      'discussion curation applied (LLM)',
    );
    return kept as T[];
  } catch (err) {
    logger.warn(
      { platform, err: (err as Error).message },
      'discussion LLM curation failed — using conservative keyword fallback',
    );
  }

  return fallbackKeywordFilter(structural, brand, domain, siteKeywords, {
    loose: looseFallback,
  }).slice(0, MAX_KEPT) as T[];
}

const MULTI_CURATION_SYSTEM = `${DISCUSSION_CURATION_SYSTEM}

You may receive up to three platform sections in one request (reddit, facebook, generic).
Return JSON with optional keys "reddit", "facebook", "generic" — each with keep/reject arrays.
Only include keys for platforms that have candidates in the prompt.`;

function buildMultiDiscussionPrompt(input: {
  brand: string;
  domain: string;
  aliases: string[];
  siteKeywords: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  sections: Array<{ platform: DiscussionPlatform; posts: DiscussionPost[] }>;
}): string {
  const blocks = input.sections.map(({ platform, posts }) => {
    const single = buildDiscussionCurationPrompt({
      platform,
      brand: input.brand,
      domain: input.domain,
      aliases: input.aliases,
      siteKeywords: input.siteKeywords,
      searchPlanCategory: input.searchPlanCategory,
      searchPlanRationale: input.searchPlanRationale,
      marketCountry: input.marketCountry,
      posts,
    });
    return `=== ${platform.toUpperCase()} ===\n${single}`;
  });
  return blocks.join('\n\n');
}

export interface CurateAllDiscussionInput {
  brand: string;
  domain: string;
  siteKeywords: string[];
  brandAliases?: string[];
  searchPlanCategory?: SearchPlanCategory;
  searchPlanRationale?: string;
  marketCountry?: MarketCountry | null;
  reddit: RedditPost[];
  facebook: FacebookPost[];
  crossPlatform: CrossPlatformPost[];
}

export async function curateAllDiscussionPostsForDisplay(
  input: CurateAllDiscussionInput,
): Promise<{
  reddit: RedditPost[];
  facebook: FacebookPost[];
  crossPlatform: CrossPlatformPost[];
}> {
  const aliases = input.brandAliases ?? [];
  const structuralReddit = minimalStructuralFilter(input.reddit);
  const structuralFacebook = minimalStructuralFilter(input.facebook);
  const structuralCross = minimalStructuralFilter(input.crossPlatform);

  const emptyFallback = () => ({
    reddit: fallbackKeywordFilter(
      structuralReddit,
      input.brand,
      input.domain,
      input.siteKeywords,
    ).slice(0, MAX_KEPT) as RedditPost[],
    facebook: fallbackKeywordFilter(
      structuralFacebook,
      input.brand,
      input.domain,
      input.siteKeywords,
    ).slice(0, MAX_KEPT) as FacebookPost[],
    crossPlatform: fallbackKeywordFilter(
      structuralCross,
      input.brand,
      input.domain,
      input.siteKeywords,
      { loose: true },
    ).slice(0, MAX_KEPT) as CrossPlatformPost[],
  });

  if (!shouldCurateDiscussionPosts()) {
    return emptyFallback();
  }

  const sections: Array<{ platform: DiscussionPlatform; posts: DiscussionPost[] }> = [];
  if (structuralReddit.length > 0) {
    sections.push({
      platform: 'reddit',
      posts: structuralReddit.slice(0, MAX_LLM_CANDIDATES),
    });
  }
  if (structuralFacebook.length > 0) {
    sections.push({
      platform: 'facebook',
      posts: structuralFacebook.slice(0, MAX_LLM_CANDIDATES),
    });
  }
  if (structuralCross.length > 0) {
    sections.push({
      platform: 'generic',
      posts: structuralCross.slice(0, MAX_LLM_CANDIDATES),
    });
  }

  if (sections.length === 0) {
    return { reddit: [], facebook: [], crossPlatform: [] };
  }

  if (sections.length === 1) {
    const only = sections[0]!;
    const kept = await curateDiscussionPostsForDisplay({
      platform: only.platform,
      brand: input.brand,
      domain: input.domain,
      siteKeywords: input.siteKeywords,
      brandAliases: aliases,
      searchPlanCategory: input.searchPlanCategory,
      searchPlanRationale: input.searchPlanRationale,
      marketCountry: input.marketCountry,
      posts: only.posts as RedditPost[],
    });
    return {
      reddit: only.platform === 'reddit' ? (kept as RedditPost[]) : [],
      facebook: only.platform === 'facebook' ? (kept as FacebookPost[]) : [],
      crossPlatform: only.platform === 'generic' ? (kept as CrossPlatformPost[]) : [],
    };
  }

  const postMaps = {
    reddit: new Map(
      (sections.find((s) => s.platform === 'reddit')?.posts ?? [])
        .filter((p) => p.url)
        .map((p) => [p.url!.trim().toLowerCase(), p as RedditPost] as const),
    ),
    facebook: new Map(
      (sections.find((s) => s.platform === 'facebook')?.posts ?? [])
        .filter((p) => p.url)
        .map((p) => [p.url!.trim().toLowerCase(), p as FacebookPost] as const),
    ),
    generic: new Map(
      (sections.find((s) => s.platform === 'generic')?.posts ?? [])
        .filter((p) => p.url)
        .map((p) => [p.url!.trim().toLowerCase(), p as CrossPlatformPost] as const),
    ),
  };

  try {
    const presenceModel = resolvePresenceModel(ai.name);
    const { data } = await ai.generateStructuredOutput({
      schema: MultiDiscussionCurationSchema,
      schemaName: 'MultiDiscussionCuration',
      system: MULTI_CURATION_SYSTEM,
      prompt: buildMultiDiscussionPrompt({
        brand: input.brand,
        domain: input.domain,
        aliases,
        siteKeywords: input.siteKeywords,
        searchPlanCategory: input.searchPlanCategory,
        searchPlanRationale: input.searchPlanRationale,
        marketCountry: input.marketCountry,
        sections,
      }),
      temperature: 0.1,
      ...(presenceModel ? { model: presenceModel } : {}),
    });

    const redditCandidates = sections.find((s) => s.platform === 'reddit')?.posts ?? [];
    const facebookCandidates = sections.find((s) => s.platform === 'facebook')?.posts ?? [];
    const crossCandidates = sections.find((s) => s.platform === 'generic')?.posts ?? [];

    const reddit =
      data.reddit && redditCandidates.length > 0
        ? applyLlmKeeps(
            data.reddit.keep,
            postMaps.reddit,
            redditCandidates as RedditPost[],
          )
        : [];
    const facebook =
      data.facebook && facebookCandidates.length > 0
        ? applyLlmKeeps(
            data.facebook.keep,
            postMaps.facebook,
            facebookCandidates as FacebookPost[],
          )
        : [];
    const crossPlatform =
      data.generic && crossCandidates.length > 0
        ? applyLlmKeeps(
            data.generic.keep,
            postMaps.generic,
            crossCandidates as CrossPlatformPost[],
          )
        : [];

    logger.info(
      {
        platforms: sections.map((s) => s.platform),
        kept: { reddit: reddit.length, facebook: facebook.length, generic: crossPlatform.length },
      },
      'multi-platform discussion curation applied (single LLM call)',
    );

    return { reddit, facebook, crossPlatform };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'batched discussion curation failed — falling back per platform',
    );
    const [reddit, facebook, crossPlatform] = await Promise.all([
      structuralReddit.length > 0
        ? curateDiscussionPostsForDisplay({
            platform: 'reddit',
            brand: input.brand,
            domain: input.domain,
            siteKeywords: input.siteKeywords,
            brandAliases: aliases,
            searchPlanCategory: input.searchPlanCategory,
            searchPlanRationale: input.searchPlanRationale,
            marketCountry: input.marketCountry,
            posts: structuralReddit as RedditPost[],
          })
        : Promise.resolve([] as RedditPost[]),
      structuralFacebook.length > 0
        ? curateDiscussionPostsForDisplay({
            platform: 'facebook',
            brand: input.brand,
            domain: input.domain,
            siteKeywords: input.siteKeywords,
            brandAliases: aliases,
            searchPlanCategory: input.searchPlanCategory,
            searchPlanRationale: input.searchPlanRationale,
            marketCountry: input.marketCountry,
            posts: structuralFacebook as FacebookPost[],
          })
        : Promise.resolve([] as FacebookPost[]),
      structuralCross.length > 0
        ? curateDiscussionPostsForDisplay({
            platform: 'generic',
            brand: input.brand,
            domain: input.domain,
            siteKeywords: input.siteKeywords,
            brandAliases: aliases,
            searchPlanCategory: input.searchPlanCategory,
            searchPlanRationale: input.searchPlanRationale,
            marketCountry: input.marketCountry,
            posts: structuralCross as CrossPlatformPost[],
          })
        : Promise.resolve([] as CrossPlatformPost[]),
    ]);
    return { reddit, facebook, crossPlatform };
  }
}
