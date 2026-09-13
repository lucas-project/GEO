import * as cheerio from 'cheerio';
import { cache } from '@shared/cache';
import { config } from '@shared/config';
import { detectCaptchaOrBlock, parseCount } from './platforms/parse-helpers';
import type { FetchPageFn } from './platforms/types';

export const TOP_SEARCH_HITS = 5;

export type SearchHitEngine = 'bing' | 'duckduckgo' | 'xhs-cli' | 'rdt-cli' | 'jina';

export interface SearchHit {
  url: string;
  title?: string;
  snippet?: string;
  engine: SearchHitEngine;
}

export interface ParsedSearchPage {
  hits: SearchHit[];
  hitEstimate: number;
  domains: string[];
}

const SEARCH_ENGINE_HOSTS = new Set([
  'bing.com',
  'duckduckgo.com',
  'microsoft.com',
  'google.com',
  'yahoo.com',
]);

function normalizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('javascript:')) return null;
  try {
    if (trimmed.startsWith('http')) return new URL(trimmed).toString();
    if (trimmed.includes('.')) return new URL(`https://${trimmed}`).toString();
  } catch {
    return null;
  }
  return null;
}

function isSearchEngineUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return [...SEARCH_ENGINE_HOSTS].some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return true;
  }
}

function pushHit(
  hits: SearchHit[],
  seenUrls: Set<string>,
  url: string,
  engine: SearchHit['engine'],
  title?: string,
  snippet?: string,
): void {
  const normalized = normalizeHref(url);
  if (!normalized || seenUrls.has(normalized) || isSearchEngineUrl(normalized)) return;
  seenUrls.add(normalized);
  hits.push({ url: normalized, title: title || undefined, snippet: snippet || undefined, engine });
}

function parseBingResults($: cheerio.CheerioAPI, engine: SearchHit['engine']): SearchHit[] {
  const hits: SearchHit[] = [];
  const seenUrls = new Set<string>();

  $('li.b_algo, .b_algo').each((_, el) => {
    const node = $(el);
    const linkEl = node.find('h2 a[href^="http"], a[href^="http"]').first();
    const href = linkEl.attr('href');
    if (!href) return;
    const title = linkEl.text().trim();
    const snippet = node.find('.b_caption p, .b_snippet').first().text().trim();
    pushHit(hits, seenUrls, href, engine, title, snippet);
  });

  return hits;
}

function parseDuckDuckGoResults($: cheerio.CheerioAPI, engine: SearchHit['engine']): SearchHit[] {
  const hits: SearchHit[] = [];
  const seenUrls = new Set<string>();

  $('.result, .web-result, .results_links').each((_, el) => {
    const node = $(el);
    const linkEl = node.find('a.result__a, a.result__url, a[href^="http"]').first();
    const href = linkEl.attr('href');
    if (!href) return;
    const title = linkEl.text().trim();
    const snippet = node.find('.result__snippet, .snippet').first().text().trim();
    pushHit(hits, seenUrls, href, engine, title, snippet);
  });

  if (hits.length === 0) {
    $('a.result__a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      pushHit(hits, seenUrls, href, engine, $(el).text().trim());
    });
  }

  return hits;
}

/** Last resort: harvest external links from SERP body. */
function harvestSerpLinks(
  $: cheerio.CheerioAPI,
  engine: SearchHit['engine'],
  max = TOP_SEARCH_HITS,
): SearchHit[] {
  const hits: SearchHit[] = [];
  const seenUrls = new Set<string>();

  $('a[href^="http"]').each((_, el) => {
    if (hits.length >= max) return false;
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();
    if (title.length < 3) return;
    pushHit(hits, seenUrls, href, engine, title);
  });

  return hits;
}

/** Parse Bing / DuckDuckGo SERP HTML into structured hits. */
export function parseSearchResults(html: string, engine: SearchHit['engine']): ParsedSearchPage {
  const $ = cheerio.load(html);
  let hits: SearchHit[] =
    engine === 'duckduckgo' ? parseDuckDuckGoResults($, engine) : parseBingResults($, engine);

  if (hits.length === 0) {
    hits = harvestSerpLinks($, engine);
  }

  const capped = hits.slice(0, TOP_SEARCH_HITS);
  const domains = [
    ...new Set(
      capped.map((h) => {
        try {
          return new URL(h.url).hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      }),
    ),
  ].filter(Boolean);

  const statsText = $('#result-stats, .sb_count, .LHJvCe').text();
  const hitEstimate = parseCount(statsText) || capped.length;

  return { hits: capped, hitEstimate, domains };
}

const SEARCH_ENGINES: Array<{
  engine: SearchHit['engine'];
  buildUrl: (q: string) => string;
}> = [
  { engine: 'bing', buildUrl: (q) => `https://www.bing.com/search?q=${q}` },
  { engine: 'duckduckgo', buildUrl: (q) => `https://lite.duckduckgo.com/lite/?q=${q}` },
  { engine: 'duckduckgo', buildUrl: (q) => `https://html.duckduckgo.com/html/?q=${q}` },
];

export interface SearchSerpOptions {
  /** When true, never fall back to Playwright (search supplement only). */
  httpOnly?: boolean;
  /** Restrict SERP backends (default: all). Prefer `['bing']` to avoid slow DDG. */
  engines?: Array<SearchHit['engine']>;
  /** Disable only for callers that require a fresh observation. */
  useCache?: boolean;
}

export function serpCacheKey(query: string, options?: SearchSerpOptions): string {
  const engines = options?.engines?.slice().sort().join(',') ?? 'all';
  const mode = options?.httpOnly ? 'http' : 'fallback';
  return `presence:serp:${encodeURIComponent(query.trim().toLowerCase())}:${engines}:${mode}`;
}

async function tryFetchSerp(
  url: string,
  engine: SearchHit['engine'],
  fetchPage: FetchPageFn,
  options?: SearchSerpOptions,
): Promise<{ hits: SearchHit[]; engine: SearchHit['engine']; finalUrl?: string } | null> {
  const attempts: Array<() => Promise<{ html: string; statusCode: number; title?: string | null; finalUrl: string }>> = [
    async () => {
      const page = await fetchPage(url, { httpOnly: true });
      return { html: page.html, statusCode: page.statusCode, title: page.title, finalUrl: page.finalUrl };
    },
  ];
  if (!options?.httpOnly) {
    attempts.push(async () => {
      const page = await fetchPage(url);
      return { html: page.html, statusCode: page.statusCode, title: page.title ?? null, finalUrl: page.finalUrl };
    });
  }

  for (const attempt of attempts) {
    try {
      const page = await attempt();
      if (page.statusCode >= 400) continue;
      if (detectCaptchaOrBlock(page.html, page.title ?? null, page.statusCode)) continue;
      const parsed = parseSearchResults(page.html, engine);
      if (parsed.hits.length > 0) {
        return { hits: parsed.hits, engine, finalUrl: page.finalUrl };
      }
    } catch {
      /* next attempt */
    }
  }

  return null;
}

export async function runBingDdgSearch(
  query: string,
  fetchPage: FetchPageFn,
  options?: SearchSerpOptions,
): Promise<{ hits: SearchHit[]; engine: SearchHit['engine'] | null; finalUrl?: string }> {
  const key = serpCacheKey(query, options);
  if (options?.useCache !== false) {
    const cached = await cache.get<{ hits: SearchHit[]; engine: SearchHit['engine']; finalUrl?: string }>(key);
    if (cached?.hits.length) return cached;
  }
  const q = encodeURIComponent(query);
  const allowed = options?.engines ? new Set(options.engines) : null;
  const engines = allowed
    ? SEARCH_ENGINES.filter((e) => allowed.has(e.engine))
    : SEARCH_ENGINES;

  for (const { engine, buildUrl } of engines) {
    const result = await tryFetchSerp(buildUrl(q), engine, fetchPage, options);
    if (result) {
      if (options?.useCache !== false) {
        await cache.set(key, result, config.presenceProbe.serpCacheTtlSeconds);
      }
      return result;
    }
  }

  return { hits: [], engine: null };
}
