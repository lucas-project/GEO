/**
 * Keywords from literal on-page text of the target website only (no LLM entities).
 * Terms are short (max 3 words) — never full page titles or sentences.
 */

export const MAX_KEYWORD_WORDS = 3;
export const MAX_KEYWORD_CHARS = 36;

export interface GeoContentKeyword {
  term: string;
  relevance: number;
  source: 'title' | 'heading' | 'description' | 'faq' | 'body';
}

interface FaqRow {
  question?: string;
}

interface HeadingRow {
  text?: string;
}

interface ChunkRow {
  heading?: string | null;
  text?: string;
}

interface TableRow {
  headers?: string[];
  rows?: string[][];
}

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'your',
  'our',
  'we',
  'you',
  'it',
  'this',
  'that',
  'as',
  'can',
  'will',
  'all',
  'more',
  'about',
  'home',
  'page',
  'click',
  'here',
  'learn',
  'read',
  'get',
  'see',
  'whether',
  'expect',
  'started',
  'youre',
  'you’d',
  'you\'d',
  're',
  'new',
  'best',
  'top',
  'us',
  'com',
  'au',
  'ltd',
  'pty',
]);

/** Reject company taglines, URLs, and sentence-like strings. */
export function isValidKeywordTerm(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 2 || t.length > MAX_KEYWORD_CHARS) return false;
  if (/[｜|@#'’“”!?]/.test(t)) return false;
  if (/https?:\/\//i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_KEYWORD_WORDS) return false;
  if (words.some((w) => STOP.has(w.toLowerCase()))) return false;
  return true;
}

/** Normalize to a short keyword (max 3 words) or return null. */
export function trimToKeyword(term: string): string | null {
  const cleaned = term
    .trim()
    .replace(/[｜|–—•]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
  if (words.length === 0) return null;
  const slice = words.slice(0, MAX_KEYWORD_WORDS);
  const phrase = slice.join(' ');
  return isValidKeywordTerm(phrase) ? phrase : null;
}

function normForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ');
}

function addScore(
  map: Map<string, { term: string; score: number; source: GeoContentKeyword['source'] }>,
  term: string,
  score: number,
  source: GeoContentKeyword['source'],
) {
  const t = trimToKeyword(term);
  if (!t) return;
  const key = normForMatch(t);
  const prev = map.get(key);
  if (!prev || score > prev.score) {
    map.set(key, { term: t, score: (prev?.score ?? 0) + score, source });
  } else if (prev) {
    map.set(key, { term: prev.term, score: prev.score + score * 0.35, source: prev.source });
  }
}

function isContiguousSubsequence(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Drop "split" / "system" when "split system" is kept. */
export function pruneSubsumedKeywords(keywords: GeoContentKeyword[]): GeoContentKeyword[] {
  const sorted = [...keywords].sort((a, b) => {
    const wa = a.term.split(/\s+/).length;
    const wb = b.term.split(/\s+/).length;
    if (wb !== wa) return wb - wa;
    return b.relevance - a.relevance;
  });

  const kept: GeoContentKeyword[] = [];
  for (const k of sorted) {
    const words = k.term.toLowerCase().split(/\s+/).filter(Boolean);
    const subsumed = kept.some((longer) => {
      const lw = longer.term.toLowerCase().split(/\s+/).filter(Boolean);
      if (lw.length <= words.length) return false;
      return isContiguousSubsequence(words, lw);
    });
    if (!subsumed) kept.push(k);
  }
  return kept;
}

/** Prefer 2–3 word phrases; add 1-word only for strong acronyms (HVAC). */
function extractShortPhrases(text: string): string[] {
  const cleaned = text.replace(/[｜|–—:•,&/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const n of [3, 2] as const) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      const norm = normForMatch(phrase);
      if (!isValidKeywordTerm(phrase) || seen.has(norm)) continue;
      seen.add(norm);
      out.push(phrase);
    }
  }

  for (const w of words) {
    if (w.length < 3) continue;
    const isAcronym = w === w.toUpperCase() && w.length >= 3;
    if (!isAcronym) continue;
    const norm = normForMatch(w);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(w);
    }
  }

  return out;
}

function titleSegments(title: string): string[] {
  return title
    .split(/[｜|–—:•]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
}

export function buildPageTextCorpus(input: {
  title: string;
  description: string;
  headings: string[];
  faqQuestions: string[];
  chunkTexts: string[];
  tableTexts: string[];
}): string {
  return normForMatch(
    [input.title, input.description, ...input.headings, ...input.faqQuestions, ...input.chunkTexts, ...input.tableTexts].join(
      ' ',
    ),
  );
}

function appearsOnPage(term: string, corpus: string): boolean {
  const t = normForMatch(term);
  if (!t || t.length < 2) return false;
  return corpus.includes(t);
}

export function extractRelevantKeywords(input: {
  title: string;
  description: string;
  headings: string[];
  faqQuestions: string[];
  chunkTexts: string[];
  tableTexts: string[];
  limit?: number;
}): GeoContentKeyword[] {
  const corpus = buildPageTextCorpus(input);
  const map = new Map<string, { term: string; score: number; source: GeoContentKeyword['source'] }>();
  const limit = input.limit ?? 18;

  for (const segment of titleSegments(input.title)) {
    for (const phrase of extractShortPhrases(segment)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.68, 'title');
    }
  }

  for (const h of input.headings) {
    for (const phrase of extractShortPhrases(h)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.46, 'heading');
    }
  }

  if (input.description.trim()) {
    for (const phrase of extractShortPhrases(input.description)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.38, 'description');
    }
  }

  for (const q of input.faqQuestions) {
    for (const phrase of extractShortPhrases(q)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.34, 'faq');
    }
  }

  for (const chunk of input.chunkTexts.slice(0, 8)) {
    for (const phrase of extractShortPhrases(chunk)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.28, 'body');
    }
  }

  for (const cell of input.tableTexts) {
    for (const phrase of extractShortPhrases(cell)) {
      if (appearsOnPage(phrase, corpus)) addScore(map, phrase, 0.24, 'body');
    }
  }

  const raw = [...map.values()]
    .filter((v) => isValidKeywordTerm(v.term) && appearsOnPage(v.term, corpus))
    .map((v) => ({
      term: v.term,
      relevance: Math.min(1, Math.round(v.score * 100) / 100),
      source: v.source,
    }))
    .sort((a, b) => {
      const wa = a.term.split(/\s+/).length;
      const wb = b.term.split(/\s+/).length;
      if (wb !== wa) return wb - wa;
      return b.relevance - a.relevance;
    });

  return pruneSubsumedKeywords(raw).slice(0, limit);
}

export function parseFaqQuestions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const f of list) {
    const q = (f as FaqRow)?.question;
    if (typeof q === 'string' && q.trim()) out.push(q.trim());
    if (out.length >= 8) break;
  }
  return out;
}

export function parseHeadingTexts(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const h of list) {
    const t = (h as HeadingRow)?.text;
    if (typeof t === 'string' && t.trim()) out.push(t.trim());
    if (out.length >= 14) break;
  }
  return out;
}

export function parseChunkTexts(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const c of list) {
    const row = c as ChunkRow;
    const parts: string[] = [];
    if (typeof row.heading === 'string' && row.heading.trim()) parts.push(row.heading.trim());
    if (typeof row.text === 'string' && row.text.trim()) parts.push(row.text.trim());
    if (parts.length) out.push(parts.join(' '));
    if (out.length >= 12) break;
  }
  return out;
}

export function parseTableTexts(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const t of list) {
    const row = t as TableRow;
    if (Array.isArray(row.headers)) {
      for (const h of row.headers) {
        if (typeof h === 'string' && h.trim()) out.push(h.trim());
      }
    }
    if (Array.isArray(row.rows)) {
      for (const r of row.rows) {
        if (!Array.isArray(r)) continue;
        for (const cell of r) {
          if (typeof cell === 'string' && cell.trim()) out.push(cell.trim());
        }
      }
    }
    if (out.length >= 24) break;
  }
  return out;
}
