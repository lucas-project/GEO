/**
 * Derive search needles from issue highlights and mark them in escaped HTML source.
 */

import type { PageCodeHighlight, SourceRange } from '@modules/geo-audit';
import { locateHeadingTagRanges } from '@modules/geo-audit';

const MIN_NEEDLE_LEN = 10;
const MAX_NEEDLES = 12;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Collect sourceRanges from highlights (preferred for highlighting). */
export function collectSourceRanges(highlights: PageCodeHighlight[]): SourceRange[] {
  const ranges: SourceRange[] = [];
  for (const h of highlights) {
    if (h.sourceRanges?.length) ranges.push(...h.sourceRanges);
  }
  return ranges;
}

/** Build unique search strings from highlight snippets to locate issue regions in full HTML. */
export function deriveHighlightNeedles(highlights: PageCodeHighlight[]): string[] {
  const needles = new Set<string>();

  for (const h of highlights) {
    if (h.kind === 'chunk') {
      const text = h.content.trim();
      if (text.length >= MIN_NEEDLE_LEN) needles.add(text.slice(0, 120));
      const firstSentence = text.split(/[.!?]\s/)[0]?.trim();
      if (firstSentence && firstSentence.length >= MIN_NEEDLE_LEN) {
        needles.add(firstSentence.slice(0, 100));
      }
    } else {
      const plain = stripTags(h.content);
      if (plain.length >= MIN_NEEDLE_LEN) needles.add(plain.slice(0, 150));

      for (const m of h.content.matchAll(/<([hH][1-4])[^>]*>([^<]{4,120})<\//g)) {
        const inner = m[2].trim();
        if (inner.length >= 4) needles.add(inner);
        needles.add(`<${m[1]}>${inner}</${m[1]}>`);
      }

      const scriptMatch = h.content.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/i);
      if (scriptMatch) {
        const inner = scriptMatch[0].slice(0, 200);
        if (inner.length >= MIN_NEEDLE_LEN) needles.add(inner);
      }

      for (const m of h.content.matchAll(/<meta[^>]+>/gi)) {
        needles.add(m[0]);
      }
      for (const m of h.content.matchAll(/<title>[^<]+<\/title>/gi)) {
        needles.add(m[0]);
      }
    }
  }

  return [...needles]
    .filter((n) => n.length >= MIN_NEEDLE_LEN)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_NEEDLES);
}

export interface SourceMarkDetail {
  label: string;
  problem?: string;
  fixHint?: string;
  suggestedExample?: string;
}

export interface HighlightedSourceResult {
  html: string;
  matchCount: number;
  /** Issue highlight label for each &lt;mark&gt;, in document order. */
  markLabels: string[];
  /** Full context per &lt;mark&gt;, aligned with markLabels. */
  markDetails: SourceMarkDetail[];
  /** Raw source slice for each mark (for rewrite input). */
  markTexts: string[];
}

type Span = { start: number; end: number };
type LabeledSpan = Span & SourceMarkDetail;

const EMPTY_RESULT: HighlightedSourceResult = {
  html: '',
  matchCount: 0,
  markLabels: [],
  markDetails: [],
  markTexts: [],
};

/** Plain text from an HTML/mark slice for editable rewrite input. */
export function plainTextForRewrite(htmlOrText: string): string {
  const plain = stripTags(htmlOrText).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const sentence = plain.match(/^(.+?[.!?])(?:\s+|$)/)?.[1]?.trim();
  if (sentence && sentence.length >= 20) return sentence;
  return plain.length > 400 ? `${plain.slice(0, 397)}…` : plain;
}

function unescapeHtmlBasic(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function markDetailsFromSpans(spans: LabeledSpan[]): SourceMarkDetail[] {
  return spans.map(({ label, problem, fixHint, suggestedExample }) => ({
    label,
    problem,
    fixHint,
    suggestedExample,
  }));
}

function mergeField(a: string | undefined, b: string | undefined): string | undefined {
  if (!b) return a;
  if (!a || a === b) return b;
  return `${a} · ${b}`;
}

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  spans.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (!last || s.start > last.end) {
      merged.push({ ...s });
    } else {
      last.end = Math.max(last.end, s.end);
    }
  }
  return merged;
}

function mergeLabeledSpans(spans: LabeledSpan[]): LabeledSpan[] {
  if (spans.length === 0) return [];
  spans.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  const merged: LabeledSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (!last || s.start > last.end) {
      merged.push({ ...s });
    } else {
      last.end = Math.max(last.end, s.end);
      if (s.label !== last.label) {
        last.label = `${last.label} · ${s.label}`;
      }
      last.problem = mergeField(last.problem, s.problem);
      last.fixHint = mergeField(last.fixHint, s.fixHint);
      last.suggestedExample = mergeField(last.suggestedExample, s.suggestedExample);
    }
  }
  return merged;
}

function applyMarks(escaped: string, spans: Span[]): HighlightedSourceResult {
  if (spans.length === 0) {
    return { html: escaped, matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  }

  const labeled = spans.map((s) => ({
    ...s,
    label: 'Highlighted region',
    problem: 'This passage matched audit evidence but has no stored explanation.',
    fixHint: 'Review the related issue recommendation and update the highlighted markup or copy.',
  }));
  return applyLabeledMarksEscaped(escaped, labeled);
}

function applyLabeledMarksEscaped(escaped: string, spans: LabeledSpan[]): HighlightedSourceResult {
  if (spans.length === 0) {
    return { html: escaped, matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  }

  const merged = mergeLabeledSpans(spans);
  const markDetails = markDetailsFromSpans(merged);
  let out = '';
  let cursor = 0;
  for (const { start, end } of merged) {
    out += escaped.slice(cursor, start);
    out += `<mark class="geo-source-mark">${escaped.slice(start, end)}</mark>`;
    cursor = end;
  }
  out += escaped.slice(cursor);
  return {
    html: out,
    matchCount: merged.length,
    markLabels: markDetails.map((m) => m.label),
    markDetails,
    markTexts: merged.map(({ start, end }) => unescapeHtmlBasic(escaped.slice(start, end))),
  };
}

function applyLabeledMarksRaw(source: string, spans: LabeledSpan[]): HighlightedSourceResult {
  if (spans.length === 0) {
    return { html: escapeHtml(source), matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  }

  const merged = mergeLabeledSpans(spans);
  const markDetails = markDetailsFromSpans(merged);
  let out = '';
  let cursor = 0;
  for (const { start, end } of merged) {
    out += escapeHtml(source.slice(cursor, start));
    out += `<mark class="geo-source-mark">${escapeHtml(source.slice(start, end))}</mark>`;
    cursor = end;
  }
  out += escapeHtml(source.slice(cursor));
  return {
    html: out,
    matchCount: merged.length,
    markLabels: markDetails.map((m) => m.label),
    markDetails,
    markTexts: merged.map(({ start, end }) => source.slice(start, end)),
  };
}

function isHeadingOutlineHighlight(h: PageCodeHighlight): boolean {
  return h.kind === 'html' && /heading outline/i.test(h.label);
}

function labeledSpansFromHighlights(
  source: string,
  highlights: PageCodeHighlight[],
  offset: number,
  sourceLength: number,
): LabeledSpan[] {
  const spans: LabeledSpan[] = [];
  for (const h of highlights) {
    if (isHeadingOutlineHighlight(h)) {
      const ranges = locateHeadingTagRanges(source);
      for (const { start, end } of ranges) {
        const localStart = start - offset;
        const localEnd = end - offset;
        if (localEnd <= 0 || localStart >= sourceLength) continue;
        const s = Math.max(0, localStart);
        const e = Math.min(sourceLength, localEnd);
        if (e > s) {
          spans.push({
            start: s,
            end: e,
            label: h.label,
            problem: h.problem,
            fixHint: h.fixHint,
            suggestedExample: h.suggestedExample,
          });
        }
      }
      continue;
    }

    for (const { start, end } of h.sourceRanges ?? []) {
      const localStart = start - offset;
      const localEnd = end - offset;
      if (localEnd <= 0 || localStart >= sourceLength) continue;
      const s = Math.max(0, localStart);
      const e = Math.min(sourceLength, localEnd);
      if (e > s) {
        spans.push({
          start: s,
          end: e,
          label: h.label,
          problem: h.problem,
          fixHint: h.fixHint,
          suggestedExample: h.suggestedExample,
        });
      }
    }
  }
  return spans;
}

function labeledSpansFromNeedles(
  source: string,
  highlights: PageCodeHighlight[],
): LabeledSpan[] {
  const escaped = escapeHtml(source);
  const spans: LabeledSpan[] = [];

  for (const h of highlights) {
    for (const needle of deriveHighlightNeedles([h])) {
      const escapedNeedle = escapeHtml(needle);
      if (escapedNeedle.length < MIN_NEEDLE_LEN) continue;
      const re = new RegExp(escapeRegExp(escapedNeedle), 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(escaped)) !== null) {
        spans.push({
          start: m.index,
          end: m.index + m[0].length,
          label: h.label,
          problem: h.problem,
          fixHint: h.fixHint,
          suggestedExample: h.suggestedExample,
        });
        if (spans.length > 80) return spans;
      }
    }
  }
  return spans;
}

/** Highlight using precomputed byte ranges (absolute offsets; `offset` shifts them into `source`). */
export function buildHighlightedSourceFromRanges(
  source: string,
  ranges: SourceRange[],
  offset = 0,
): HighlightedSourceResult {
  if (ranges.length === 0) {
    return { html: escapeHtml(source), matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  }

  const spans: LabeledSpan[] = [];
  for (const { start, end } of ranges) {
    const localStart = start - offset;
    const localEnd = end - offset;
    if (localEnd <= 0 || localStart >= source.length) continue;
    const s = Math.max(0, localStart);
    const e = Math.min(source.length, localEnd);
    if (e > s) spans.push({ start: s, end: e, label: 'Highlighted region' });
  }

  return applyLabeledMarksRaw(source, spans);
}

/** Escape source and wrap needle matches in &lt;mark&gt; for safe innerHTML display. */
export function buildHighlightedSourceHtml(
  source: string,
  needles: string[],
): HighlightedSourceResult {
  const escaped = escapeHtml(source);
  if (needles.length === 0) {
    return { html: escaped, matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  }

  const spans: Span[] = [];
  const escapedNeedles = needles
    .map((n) => escapeHtml(n))
    .filter((n) => n.length >= MIN_NEEDLE_LEN);

  for (const needle of escapedNeedles) {
    const re = new RegExp(escapeRegExp(needle), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(escaped)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (spans.length > 80) break;
    }
  }

  if (spans.length === 0) return { html: escaped, matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
  return applyMarks(escaped, mergeSpans(spans));
}

/** Prefer stored sourceRanges; fall back to needle search. */
export function buildHighlightedSource(
  source: string,
  highlights: PageCodeHighlight[],
  offset = 0,
): HighlightedSourceResult {
  if (!source) return { ...EMPTY_RESULT, html: '' };

  const rangeSpans = labeledSpansFromHighlights(source, highlights, offset, source.length);
  if (rangeSpans.length > 0) {
    return applyLabeledMarksRaw(source, rangeSpans);
  }

  const needleSpans = labeledSpansFromNeedles(source, highlights);
  if (needleSpans.length > 0) {
    return applyLabeledMarksEscaped(escapeHtml(source), needleSpans);
  }

  return { html: escapeHtml(source), matchCount: 0, markLabels: [], markDetails: [], markTexts: [] };
}
