/**
 * Map highlight snippets to byte ranges in rendered HTML for reliable source marking.
 */

import * as cheerio from 'cheerio';
import type { Dimension, PageCodeHighlight } from './schemas';

export interface SourceRange {
  start: number;
  end: number;
}

const MAX_RANGES_PER_HIGHLIGHT = 5;
const MAX_HEADING_RANGES = 50;
const MIN_TEXT_LEN = 8;

function headingTextMatches(innerHtml: string, expected: string): boolean {
  const inner = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const exp = expected.replace(/\s+/g, ' ').trim();
  if (!inner || !exp) return false;
  return inner === exp || inner.includes(exp) || exp.includes(inner);
}

/**
 * Locate every h1–h4 in document order using tag-aware regex (handles attrs & nested markup).
 */
export function locateHeadingTagRanges(html: string): SourceRange[] {
  if (!html?.trim()) return [];

  const $ = cheerio.load(html);
  const ranges: SourceRange[] = [];
  let searchFrom = 0;

  $('h1, h2, h3, h4').each((_, el) => {
    if (ranges.length >= MAX_HEADING_RANGES) return false;

    const tag = String($(el).prop('tagName') ?? 'h2').toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;

    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    pattern.lastIndex = searchFrom;

    let matched = false;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      if (headingTextMatches(m[1], text)) {
        ranges.push({ start: m.index, end: m.index + m[0].length });
        searchFrom = m.index + m[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      const frag = $.html(el);
      if (frag) {
        const idx = html.indexOf(frag, searchFrom);
        if (idx >= 0) {
          ranges.push({ start: idx, end: idx + frag.length });
          searchFrom = idx + frag.length;
        }
      }
    }
  });

  return ranges;
}

/** Collapse whitespace for fuzzy matching. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Map normalized index back to original string start/end. */
function mapNormRangeToOriginal(
  original: string,
  normStart: number,
  normLen: number,
): SourceRange | null {
  let oi = 0;
  let ni = 0;
  let rangeStart = -1;
  let rangeEnd = -1;

  while (oi < original.length && ni < normStart + normLen) {
    const isWsOrig = /\s/.test(original[oi] ?? '');
    if (ni < normStart) {
      if (isWsOrig) {
        while (oi < original.length && /\s/.test(original[oi] ?? '')) oi++;
        if (ni > 0 && ni < normStart) ni++;
      } else {
        if (ni === normStart) rangeStart = oi;
        oi++;
        ni++;
      }
    } else {
      if (rangeStart < 0) rangeStart = oi;
      if (isWsOrig) {
        while (oi < original.length && /\s/.test(original[oi] ?? '')) oi++;
        if (ni > normStart) ni++;
      } else {
        oi++;
        ni++;
      }
      if (ni >= normStart + normLen) {
        rangeEnd = oi;
        break;
      }
    }
  }

  if (rangeStart < 0) return null;
  if (rangeEnd < 0) rangeEnd = Math.min(oi, original.length);
  if (rangeEnd <= rangeStart) return null;
  return { start: rangeStart, end: rangeEnd };
}

/** Find text in HTML using whitespace-normalized search. */
export function locateTextInHtml(html: string, text: string): SourceRange[] {
  const needle = normalizeWs(text);
  if (needle.length < MIN_TEXT_LEN) return [];

  const normHtml = normalizeWs(html);
  const ranges: SourceRange[] = [];
  let searchFrom = 0;

  while (ranges.length < MAX_RANGES_PER_HIGHLIGHT) {
    const idx = normHtml.indexOf(needle, searchFrom);
    if (idx < 0) break;
    const mapped = mapNormRangeToOriginal(html, idx, needle.length);
    if (mapped) ranges.push(mapped);
    searchFrom = idx + Math.max(1, Math.floor(needle.length / 2));
  }

  return ranges;
}

/** Find exact substring positions in HTML. */
export function locateExactInHtml(html: string, fragment: string): SourceRange[] {
  if (!fragment || fragment.length < MIN_TEXT_LEN) return [];
  const ranges: SourceRange[] = [];
  let from = 0;
  while (ranges.length < MAX_RANGES_PER_HIGHLIGHT) {
    const idx = html.indexOf(fragment, from);
    if (idx < 0) break;
    ranges.push({ start: idx, end: idx + fragment.length });
    from = idx + fragment.length;
  }
  return ranges;
}

/** Locate cheerio-selected regions in full rendered HTML (exact $.html() substrings). */
export function locateCheerioRegions(html: string, dim: Dimension): SourceRange[] {
  if (!html?.trim()) return [];
  const $ = cheerio.load(html);
  const fragments: string[] = [];

  const pushSel = (sel: ReturnType<typeof $>) => {
    const h = $.html(sel);
    if (h && h.length >= MIN_TEXT_LEN) fragments.push(h);
  };

  switch (dim) {
    case 'structuredContent':
    case 'entityClarity':
      $('head meta, head title, head link[rel="canonical"]').each((_, el) => pushSel($(el)));
      $('script[type="application/ld+json"]').each((_, el) => pushSel($(el)));
      break;
    case 'semanticClarity':
      return locateHeadingTagRanges(html);
    case 'citationFriendliness':
    case 'trustSignals':
      $('[itemtype*="FAQ"], .faq, [class*="faq"], [id*="faq"]').slice(0, 3).each((_, el) => pushSel($(el)));
      $('[rel="author"], .author, [class*="byline"], [itemprop="author"]').slice(0, 3).each((_, el) =>
        pushSel($(el)),
      );
      break;
    case 'aiReadability':
    case 'summarizationQuality': {
      $('title').each((_, el) => pushSel($(el)));
      $('meta[name="description"]').each((_, el) => pushSel($(el)));
      const main = $('main').first();
      if (main.length) pushSel(main);
      else {
        const article = $('article').first();
        if (article.length) pushSel(article);
      }
      break;
    }
    default:
      break;
  }

  const ranges: SourceRange[] = [];
  const seen = new Set<string>();
  for (const frag of fragments) {
    if (seen.has(frag)) continue;
    seen.add(frag);
    for (const r of locateExactInHtml(html, frag)) {
      if (ranges.length >= MAX_RANGES_PER_HIGHLIGHT * 2) break;
      ranges.push(r);
    }
  }

  return mergeRanges(ranges).slice(0, MAX_RANGES_PER_HIGHLIGHT * 2);
}

export function mergeRanges(ranges: SourceRange[]): SourceRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: SourceRange[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (!last || s.start > last.end) merged.push({ ...s });
    else last.end = Math.max(last.end, s.end);
  }
  return merged;
}

/** Attach sourceRanges to a highlight when rendered HTML is available. */
export function attachSourceRanges(
  highlight: PageCodeHighlight,
  renderedHtml: string | null | undefined,
  dim?: Dimension,
): PageCodeHighlight {
  if (!renderedHtml?.trim()) return highlight;
  if (highlight.sourceRanges?.length) return highlight;

  let ranges: SourceRange[] = [];

  if (highlight.kind === 'chunk') {
    ranges = locateTextInHtml(renderedHtml, highlight.content);
    if (ranges.length === 0) {
      const firstSentence = highlight.content.split(/[.!?]\s/)[0]?.trim();
      if (firstSentence && firstSentence.length >= MIN_TEXT_LEN) {
        ranges = locateTextInHtml(renderedHtml, firstSentence);
      }
    }
  } else if (dim) {
    ranges = locateCheerioRegions(renderedHtml, dim);
    if (ranges.length === 0) {
      ranges = locateExactInHtml(renderedHtml, highlight.content);
      if (ranges.length === 0) ranges = locateTextInHtml(renderedHtml, stripTags(highlight.content));
    }
  } else {
    ranges = locateExactInHtml(renderedHtml, highlight.content);
    if (ranges.length === 0) ranges = locateTextInHtml(renderedHtml, stripTags(highlight.content));
  }

  if (ranges.length === 0) return highlight;

  const maxRanges = dim === 'semanticClarity' ? MAX_HEADING_RANGES : MAX_RANGES_PER_HIGHLIGHT;
  return { ...highlight, sourceRanges: mergeRanges(ranges).slice(0, maxRanges) };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function attachRangesToHighlights(
  highlights: PageCodeHighlight[],
  renderedHtml: string | null | undefined,
  dim: Dimension,
): PageCodeHighlight[] {
  return highlights.map((h) => attachSourceRanges(h, renderedHtml, dim));
}
