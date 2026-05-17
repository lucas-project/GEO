/**
 * Per-page issue evidence — reasons, chunk text, and focused HTML snippets.
 */

import * as cheerio from 'cheerio';
import { canonicalPageUrl } from '@/lib/website-url';
import type { CrawlResult, CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import type { Dimension, PageCodeHighlight, PageIssueImpact } from './schemas';
import { getDimensionRecommendation } from './scoring';
import { attachRangesToHighlights } from './locate-in-source';
import {
  buildChunkHighlightGuidance,
  guidanceForHtmlSnippet,
} from './issue-guidance';

export interface IssueEvidenceContext {
  url: string;
  rootPage: CrawledPage;
  extraction: PageExtraction;
  crawl: CrawlResult;
  pageExtractions?: Array<{ page: CrawledPage; extraction: PageExtraction }>;
}

const CHUNK_TEXT_CAP = 600;
const HTML_SNIPPET_CAP = 8192;
const MAX_HIGHLIGHTS = 4;
const MAX_IMPACTED_PAGES = 30;

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (truncated)`;
}

export function pathHint(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p === '/' ? 'homepage' : p;
  } catch {
    return url;
  }
}

/** Whether this page fails dimension checks (mirrors scoring.ts). */
export function isPageAffectedForDimension(
  dim: Dimension,
  page: CrawledPage,
  extraction: PageExtraction,
): boolean {
  switch (dim) {
    case 'aiReadability': {
      const text = extraction.chunks.map((c) => c.text).join(' ');
      const words = text.split(/\s+/).filter(Boolean).length;
      const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
      const avgLen = sentences.length ? words / sentences.length : 0;
      const jsHeavy = page.hydrationDelta && page.hydrationDelta.addedTextChars > 500;
      return words < 120 || avgLen >= 35 || !extraction.metadata.language || Boolean(jsHeavy);
    }
    case 'citationFriendliness':
      return extraction.faqs.length === 0 || extraction.authors.length === 0;
    case 'semanticClarity': {
      const h1 = extraction.headings.filter((h) => h.level === 1).length;
      const h2 = extraction.headings.filter((h) => h.level === 2).length;
      return h1 !== 1 || h2 < 2;
    }
    case 'entityClarity': {
      const hasSchema = extraction.schemas.some(
        (s) => s.type === 'Organization' || s.type === 'Product',
      );
      return extraction.entities.length < 3 || !hasSchema;
    }
    case 'answerExtraction':
      return extraction.chunks.some((c) => !c.hasAnswerFirstSentence);
    case 'chunkOptimization': {
      const avg = extraction.chunks.length
        ? extraction.chunks.reduce((s, c) => s + c.wordCount, 0) / extraction.chunks.length
        : 0;
      return avg <= 60 || avg > 250;
    }
    case 'summarizationQuality': {
      const shortDesc =
        !extraction.metadata.description || extraction.metadata.description.length < 70;
      const thinLead = extraction.chunks[0] && extraction.chunks[0].wordCount < 30;
      return Boolean(shortDesc || thinLead);
    }
    case 'trustSignals':
      return extraction.authors.length === 0;
    case 'structuredContent':
      return extraction.schemas.length === 0;
    case 'crawlerFriendliness':
      return true;
    default:
      return false;
  }
}

export function pageReasonsForDimension(
  dim: Dimension,
  page: CrawledPage,
  extraction: PageExtraction,
): string[] {
  const reasons: string[] = [];

  switch (dim) {
    case 'aiReadability': {
      const text = extraction.chunks.map((c) => c.text).join(' ');
      const words = text.split(/\s+/).filter(Boolean).length;
      const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
      const avgLen = sentences.length ? words / sentences.length : 0;
      if (words < 120) reasons.push(`Body content is very short (${words} words)`);
      if (avgLen >= 35) reasons.push(`Sentences are long on average (${avgLen.toFixed(0)} words)`);
      if (!extraction.metadata.language) reasons.push('Missing html lang attribute');
      if (page.hydrationDelta && page.hydrationDelta.addedTextChars > 500) {
        reasons.push('Heavy client-side hydration — much text added after initial render');
      }
      break;
    }
    case 'citationFriendliness':
      if (extraction.faqs.length === 0) reasons.push('No FAQ blocks detected');
      if (extraction.authors.length === 0) reasons.push('No author/byline signals');
      break;
    case 'semanticClarity': {
      const h1 = extraction.headings.filter((h) => h.level === 1).length;
      const h2 = extraction.headings.filter((h) => h.level === 2).length;
      if (h1 !== 1) reasons.push(`Expected 1 H1, found ${h1}`);
      if (h2 < 2) reasons.push(`Expected at least 2 H2 headings, found ${h2}`);
      break;
    }
    case 'entityClarity': {
      if (extraction.entities.length < 3) {
        reasons.push(`Only ${extraction.entities.length} entities detected (need ≥3)`);
      }
      if (!extraction.schemas.some((s) => s.type === 'Organization' || s.type === 'Product')) {
        reasons.push('Missing Organization or Product JSON-LD');
      }
      break;
    }
    case 'answerExtraction': {
      const bad = extraction.chunks.filter((c) => !c.hasAnswerFirstSentence).length;
      if (bad > 0) reasons.push(`${bad} chunk(s) lack an answer-first opening sentence`);
      break;
    }
    case 'chunkOptimization': {
      const avg = extraction.chunks.length
        ? extraction.chunks.reduce((s, c) => s + c.wordCount, 0) / extraction.chunks.length
        : 0;
      if (avg <= 60) reasons.push(`Average chunk length is ${avg.toFixed(0)} words (target 60–250)`);
      if (avg > 250) reasons.push(`Average chunk length is ${avg.toFixed(0)} words (target 60–250)`);
      break;
    }
    case 'summarizationQuality':
      if (!extraction.metadata.description || extraction.metadata.description.length < 70) {
        reasons.push('Meta description missing or shorter than 70 characters');
      }
      if (extraction.chunks[0] && extraction.chunks[0].wordCount < 30) {
        reasons.push('Lead paragraph / first chunk is very thin');
      }
      break;
    case 'trustSignals':
      if (extraction.authors.length === 0) reasons.push('No author attribution detected');
      break;
    case 'structuredContent':
      if (extraction.schemas.length === 0) reasons.push('No JSON-LD structured data found');
      break;
    case 'crawlerFriendliness':
      reasons.push('Site-level crawler configuration affects this page');
      break;
  }

  return reasons;
}

export function chunkHighlightsForDimension(
  dim: Dimension,
  extraction: PageExtraction,
  pageReasons: string[] = [],
): PageCodeHighlight[] {
  const out: PageCodeHighlight[] = [];
  const dimFix = getDimensionRecommendation(dim);

  if (dim === 'answerExtraction') {
    const bad = extraction.chunks.filter((c) => !c.hasAnswerFirstSentence);
    for (const c of bad.slice(0, MAX_HIGHLIGHTS)) {
      const heading = c.heading?.trim();
      const g = buildChunkHighlightGuidance(dim, c, extraction, pageReasons);
      out.push({
        label: heading ? `Section: ${heading}` : `Content block (${c.wordCount} words)`,
        kind: 'chunk',
        content: cap(c.text.trim(), CHUNK_TEXT_CAP),
        problem: g.problem,
        fixHint: g.fixHint,
        suggestedExample: g.suggestedExample,
      });
    }
  }

  if (dim === 'chunkOptimization') {
    const bad = extraction.chunks.filter((c) => c.wordCount > 250 || c.wordCount < 60);
    for (const c of bad.slice(0, MAX_HIGHLIGHTS)) {
      const g = buildChunkHighlightGuidance(dim, c, extraction, pageReasons);
      out.push({
        label: `${c.heading?.trim() || c.id} (${c.wordCount} words)`,
        kind: 'chunk',
        content: cap(c.text.trim(), CHUNK_TEXT_CAP),
        problem: g.problem,
        fixHint: g.fixHint,
        suggestedExample: g.suggestedExample,
      });
    }
  }

  if (
    (dim === 'aiReadability' || dim === 'summarizationQuality') &&
    extraction.chunks[0]?.text
  ) {
    const lead = extraction.chunks[0];
    const thinLead = lead.wordCount < 30;
    const shortMeta =
      !extraction.metadata.description || extraction.metadata.description.length < 70;

    if (dim === 'summarizationQuality' && shortMeta && !thinLead) {
      // Meta-only issue handled in htmlFocusSnippet; skip duplicate chunk row
    } else {
      const g = buildChunkHighlightGuidance(dim, lead, extraction, pageReasons);
      out.push({
        label: dim === 'summarizationQuality' ? 'Opening paragraph' : 'Main body opening',
        kind: 'chunk',
        content: cap(lead.text.trim(), CHUNK_TEXT_CAP),
        problem: g.problem,
        fixHint: g.fixHint,
        suggestedExample: g.suggestedExample,
      });
    }
  }

  return out.slice(0, MAX_HIGHLIGHTS);
}

export function htmlFocusSnippet(
  dim: Dimension,
  renderedHtml: string | null | undefined,
  extraction?: PageExtraction,
): PageCodeHighlight | null {
  if (!renderedHtml?.trim()) return null;

  const $ = cheerio.load(renderedHtml);
  let label = 'Page markup';
  let content = '';
  let problem: string | undefined;
  let fixHint: string | undefined = getDimensionRecommendation(dim);
  let suggestedExample: string | undefined;

  switch (dim) {
    case 'structuredContent':
    case 'entityClarity': {
      label = '<head> — meta & JSON-LD';
      problem =
        dim === 'structuredContent'
          ? 'No JSON-LD structured data was found in the page head. Without schema, AI systems infer entity types and relationships from messy HTML.'
          : 'Organization or Product entities are not reinforced with matching JSON-LD in the head, so models may misidentify what this page is about.';
      const headParts: string[] = [];
      $('head meta, head title, head link[rel="canonical"]').each((_, el) => {
        headParts.push($.html(el));
      });
      $('script[type="application/ld+json"]').each((_, el) => {
        headParts.push($.html(el));
      });
      content = headParts.join('\n') || $('head').html() || '';
      break;
    }
    case 'semanticClarity': {
      label = 'Heading outline (h1–h4)';
      problem =
        'Heading hierarchy does not match GEO expectations (one clear H1, multiple H2 section breaks). Models use headings to infer document structure.';
      fixHint =
        'Use exactly one H1 for the page topic, then H2 for each major section. Avoid skipping levels (e.g. H1 → H4).';
      const lines: string[] = [];
      $('h1, h2, h3, h4').each((_, el) => {
        const tag = String($(el).prop('tagName') ?? 'h').toLowerCase();
        lines.push(`<${tag}>${$(el).text().trim().slice(0, 120)}</${tag}>`);
      });
      content = lines.join('\n');
      break;
    }
    case 'citationFriendliness':
    case 'trustSignals': {
      label = dim === 'citationFriendliness' ? 'FAQ & citation markup' : 'Author & trust markup';
      problem =
        dim === 'citationFriendliness'
          ? 'No FAQ blocks or citation-friendly Q&A markup were detected. Pages with explicit Q&A are more likely to be quoted by AI answers.'
          : 'No visible author/byline or author schema was found. Trust signals help models decide whether to cite this page.';
      const parts: string[] = [];
      $('[itemtype*="FAQ"], .faq, [class*="faq"], [id*="faq"]').slice(0, 3).each((_, el) => {
        parts.push($.html(el).slice(0, 1500));
      });
      $('[rel="author"], .author, [class*="byline"], [itemprop="author"]').slice(0, 3).each((_, el) => {
        parts.push($.html(el).slice(0, 800));
      });
      if (parts.length === 0) {
        content = cap($('body').html()?.slice(0, 3000) ?? '', HTML_SNIPPET_CAP);
      } else {
        content = parts.join('\n\n');
      }
      break;
    }
    case 'aiReadability':
    case 'summarizationQuality': {
      label = 'Meta tags & hero content';
      problem =
        dim === 'summarizationQuality'
          ? 'Title, meta description, or the first visible content block is weak — models pull summaries from these regions first.'
          : 'Critical readability signals live in the head and above-the-fold HTML (title, description, opening markup).';
      const meta = [
        $('title').length ? `<title>${$('title').text()}</title>` : '',
        $('meta[name="description"]').attr('content')
          ? `<meta name="description" content="${$('meta[name="description"]').attr('content')}" />`
          : '',
      ].filter(Boolean);
      const main =
        $('main').first().html()?.slice(0, 2500) ??
        $('article').first().html()?.slice(0, 2500) ??
        $('body').children().first().html()?.slice(0, 2500) ??
        '';
      content = [...meta, main].join('\n');
      break;
    }
    default:
      content = $('head').html() ?? renderedHtml.slice(0, 2000);
  }

  content = content.trim();
  if (!content) return null;

  if (extraction) {
    const htmlGuidance = guidanceForHtmlSnippet(dim, extraction, label);
    if (htmlGuidance) {
      problem = htmlGuidance.problem;
      fixHint = htmlGuidance.fixHint;
      suggestedExample = htmlGuidance.suggestedExample;
    }
  }

  return {
    label,
    kind: 'html',
    content: cap(content, HTML_SNIPPET_CAP),
    problem,
    fixHint,
    suggestedExample,
  };
}

export function buildImpactedPages(dim: Dimension, ctx: IssueEvidenceContext): PageIssueImpact[] {
  const pages = ctx.pageExtractions ?? [{ page: ctx.rootPage, extraction: ctx.extraction }];
  const impacted: PageIssueImpact[] = [];

  for (const { page, extraction } of pages) {
    if (!isPageAffectedForDimension(dim, page, extraction)) continue;

    const url = canonicalPageUrl(page.finalUrl || page.url, ctx.url);
    const pageReasons = pageReasonsForDimension(dim, page, extraction);
    const highlights: PageCodeHighlight[] = [
      ...chunkHighlightsForDimension(dim, extraction, pageReasons),
    ];

    const htmlSnippet = htmlFocusSnippet(dim, page.renderedHtml ?? page.html, extraction);
    if (htmlSnippet) highlights.push(htmlSnippet);

    const rendered = page.renderedHtml ?? page.html ?? null;
    const withRanges = attachRangesToHighlights(
      highlights.slice(0, MAX_HIGHLIGHTS + 1),
      rendered,
      dim,
    );

    impacted.push({
      url,
      pathHint: pathHint(url),
      pageReasons,
      highlights: withRanges,
    });
  }

  if (dim === 'crawlerFriendliness') {
    const site = canonicalPageUrl(ctx.rootPage.finalUrl || ctx.url, ctx.url);
    try {
      const robotsUrl = new URL('/robots.txt', site).href;
      const { robots } = ctx.crawl;
      const summary = [
        `fetched: ${robots.fetched}`,
        `allowed: ${robots.allowed}`,
        robots.crawlDelayMs != null ? `crawl-delay: ${robots.crawlDelayMs}ms` : null,
        robots.sitemaps.length ? `sitemaps: ${robots.sitemaps.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      impacted.push({
        url: robotsUrl,
        pathHint: '/robots.txt',
        pageReasons: ['Review robots.txt and sitemap configuration for AI crawlers'],
        highlights: summary
          ? [{ label: 'Crawler policy summary', kind: 'html', content: summary }]
          : [],
      });
    } catch {
      /* ignore */
    }
  }

  return impacted.slice(0, MAX_IMPACTED_PAGES);
}

/** Build minimal impacted pages from stored extraction JSON (legacy audits). */
export function buildImpactedPagesFromExtractionRow(
  dim: Dimension,
  siteUrl: string,
  row: {
    url: string;
    metadata: string;
    headings: string;
    schemas: string;
    faqs: string;
    authors: string;
    chunks: string;
    entities: string;
  },
): PageIssueImpact | null {
  type H = { level: number; text: string };
  type C = {
    id: string;
    text: string;
    heading: string | null;
    wordCount: number;
    hasAnswerFirstSentence: boolean;
  };
  type M = { description?: string | null; language?: string | null };
  type S = { type: string };
  type E = { name: string; kind: string };

  const headings = JSON.parse(row.headings || '[]') as H[];
  const chunks = JSON.parse(row.chunks || '[]') as C[];
  const meta = JSON.parse(row.metadata || '{}') as M;
  const schemas = JSON.parse(row.schemas || '[]') as S[];
  const faqs = JSON.parse(row.faqs || '[]') as unknown[];
  const authors = JSON.parse(row.authors || '[]') as unknown[];
  const entities = JSON.parse(row.entities || '[]') as E[];

  const url = canonicalPageUrl(row.url, siteUrl);
  const stubPage: CrawledPage = {
    url: row.url,
    finalUrl: row.url,
    statusCode: 200,
    contentType: 'text/html',
    html: null,
    renderedHtml: null,
    title: null,
    fetchedAt: new Date().toISOString(),
    durationMs: 0,
    screenshotPath: null,
    error: null,
    hydrationDelta: null,
  };

  const extraction: PageExtraction = {
    url: row.url,
    metadata: {
      title: null,
      description: meta.description ?? null,
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogType: null,
      twitterCard: null,
      language: meta.language ?? null,
      charset: null,
      robots: null,
    },
    headings: headings.map((h) => ({ level: h.level, text: h.text ?? '' })),
    schemas: schemas.map((s) => ({ type: s.type, raw: '{}' })),
    faqs: faqs as PageExtraction['faqs'],
    entities: entities.map((e) => ({
      name: e.name,
      kind: (['organization', 'product', 'person', 'place', 'date', 'concept', 'other'] as const).includes(
        e.kind as 'organization',
      )
        ? (e.kind as PageExtraction['entities'][0]['kind'])
        : 'other',
      count: 1,
      relevance: 1,
    })),
    chunks: chunks.map((c) => ({
      id: c.id,
      text: c.text,
      heading: c.heading,
      wordCount: c.wordCount,
      hasAnswerFirstSentence: c.hasAnswerFirstSentence,
      hasList: false,
      hasNumbers: false,
    })),
    links: [],
    tables: [],
    authors: authors as PageExtraction['authors'],
  };

  if (!isPageAffectedForDimension(dim, stubPage, extraction)) return null;

  return {
    url,
    pathHint: pathHint(url),
    pageReasons: pageReasonsForDimension(dim, stubPage, extraction),
    highlights: chunkHighlightsForDimension(
      dim,
      extraction,
      pageReasonsForDimension(dim, stubPage, extraction),
    ),
  };
}
