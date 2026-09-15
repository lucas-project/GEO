/**
 * Theme keywords from on-page text only.
 * Phrases stay within sentence/HTML boundaries; low-quality n-grams are rejected.
 */

export const MAX_KEYWORD_WORDS = 5;
export const MIN_KEYWORD_WORDS = 2;
export const MAX_KEYWORD_CHARS = 48;
export const MIN_HIGH_CONFIDENCE_KEYWORDS = 3;
export const MIN_KEYWORD_CONFIDENCE = 0.45;

export type KeywordSource = 'title' | 'heading' | 'description' | 'faq' | 'body' | 'json_ld';

export interface GeoContentKeyword {
  term: string;
  relevance: number;
  confidence?: number;
  source: KeywordSource;
  evidence?: string;
}

export interface KeywordExtractionResult {
  keywords: GeoContentKeyword[];
  status: 'ok' | 'insufficient_topic_evidence';
  reason?: string;
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
  'without',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'your',
  'our',
  'we',
  'you',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
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
  "you'd",
  "you'd",
  're',
  'new',
  'best',
  'top',
  'us',
  'com',
  'au',
  'ltd',
  'pty',
  'need',
  'needing',
  'needed',
  'use',
  'used',
  'using',
  'domain',
  'examples',
  'example',
  'permission',
  'illustrative',
  'documentation',
  'cover',
  'covers',
  'hosts',
  'host',
  'lets',
  'let',
  'make',
  'makes',
  'using',
  'across',
  'many',
  'thousands',
]);

/** Words that must not start or end a keyword phrase. */
const FUNCTION_EDGE_WORDS = new Set([
  ...STOP,
  'into',
  'onto',
  'upon',
  'over',
  'under',
  'than',
  'then',
  'also',
  'just',
  'only',
  'very',
  'such',
  'via',
  'per',
  'vs',
  'versus',
  'how',
  'what',
  'when',
  'where',
  'why',
  'who',
  'which',
  'their',
  'them',
  'his',
  'her',
  'my',
]);

const GENERIC_ONLY = new Set([
  'website',
  'websites',
  'online',
  'service',
  'services',
  'product',
  'products',
  'company',
  'business',
  'info',
  'information',
  'content',
  'article',
  'articles',
  'guide',
  'guides',
  'help',
  'support',
  'contact',
  'about',
  'welcome',
]);

const BOILERPLATE_RE =
  /\b(cookie|cookies|privacy policy|terms of (use|service)|accept all|sign in|log in|download now|install now|javascript|enable cookies|all rights reserved)\b/i;

const CODE_FRAGMENT_RE =
  /[{};<>]|body\s*\{|font-family|vh\s*auto|px\s*;|margin:|padding:|color:|background|rgba?\(|#[0-9a-f]{3,8}\b/i;

interface ScoredCandidate {
  term: string;
  score: number;
  source: KeywordSource;
  evidence: string;
  bodyContexts: number;
  inTitleOrHeading: boolean;
}

function normForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Split plain text into sentence-like segments (never cross sentence boundaries). */
export function splitTextSegments(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+|\n+|<\/?(?:p|div|li|br|h[1-6]|td|th)[^>]*>/i)
    .map((s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4);
}

function titleSegments(title: string): string[] {
  return title
    .split(/[｜|–—:•]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
}

function isEdgeFunctionWord(w: string): boolean {
  return FUNCTION_EDGE_WORDS.has(w.toLowerCase());
}

function looksLikeCodeOrBoilerplate(term: string): boolean {
  if (CODE_FRAGMENT_RE.test(term)) return true;
  if (BOILERPLATE_RE.test(term)) return true;
  if (/[\\/]/.test(term) && /\.(css|js|html|exe|pkg|zip|msi)/i.test(term)) return true;
  return false;
}

function isGenericOnlyPhrase(words: string[]): boolean {
  return words.every((w) => GENERIC_ONLY.has(w.toLowerCase()) || STOP.has(w.toLowerCase()));
}

/** Reject company taglines, URLs, code, and sentence-like strings. */
export function isValidKeywordTerm(term: string): boolean {
  const t = term.trim();
  if (!t || t.length < 2 || t.length > MAX_KEYWORD_CHARS) return false;
  if (/[｜|@#'’“”!?]/.test(t)) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (looksLikeCodeOrBoilerplate(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < MIN_KEYWORD_WORDS || words.length > MAX_KEYWORD_WORDS) return false;
  if (isEdgeFunctionWord(words[0]!) || isEdgeFunctionWord(words[words.length - 1]!)) return false;
  if (words.some((w) => STOP.has(w.toLowerCase()))) return false;
  if (isGenericOnlyPhrase(words)) return false;
  return true;
}

/** Normalize to a short keyword or return null. */
export function trimToKeyword(term: string): string | null {
  const cleaned = term
    .trim()
    .replace(/[｜|–—•]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
  if (words.length < MIN_KEYWORD_WORDS) return null;
  // Trim leading/trailing edge function words that survived cleaning
  while (words.length >= MIN_KEYWORD_WORDS && isEdgeFunctionWord(words[0]!)) words.shift();
  while (words.length >= MIN_KEYWORD_WORDS && isEdgeFunctionWord(words[words.length - 1]!)) {
    words.pop();
  }
  if (words.length < MIN_KEYWORD_WORDS) return null;
  const slice = words.slice(0, MAX_KEYWORD_WORDS);
  const phrase = slice.join(' ');
  return isValidKeywordTerm(phrase) ? phrase : null;
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

/** Drop shorter phrases already covered by a longer kept phrase of equal-or-higher confidence. */
export function pruneSubsumedKeywords(keywords: GeoContentKeyword[]): GeoContentKeyword[] {
  const sorted = [...keywords].sort((a, b) => {
    const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (Math.abs(conf) > 0.02) return conf;
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
      if ((longer.confidence ?? 0) + 0.05 < (k.confidence ?? 0)) return false;
      return isContiguousSubsequence(words, lw);
    });
    if (!subsumed) kept.push(k);
  }
  return kept;
}

/** Extract 2–maxWords phrases within a single text segment. */
function extractShortPhrases(text: string, maxWords: number = MAX_KEYWORD_WORDS): string[] {
  const cleaned = text.replace(/[｜|–—:•,&/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Keep stopwords in the stream so n-grams never jump across them.
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, ''))
    .filter((w) => w.length >= 2);
  const out: string[] = [];
  const seen = new Set<string>();
  const maxN = Math.min(maxWords, MAX_KEYWORD_WORDS, words.length);

  for (let n = maxN; n >= MIN_KEYWORD_WORDS; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      const slice = words.slice(i, i + n);
      if (slice.some((w) => STOP.has(w.toLowerCase()))) continue;
      if (isEdgeFunctionWord(slice[0]!) || isEdgeFunctionWord(slice[slice.length - 1]!)) continue;
      const phrase = slice.join(' ');
      const norm = normForMatch(phrase);
      if (!isValidKeywordTerm(phrase) || seen.has(norm)) continue;
      seen.add(norm);
      out.push(phrase);
    }
  }

  return out;
}

export function buildPageTextCorpus(input: {
  title: string;
  description: string;
  headings: string[];
  faqQuestions: string[];
  chunkTexts: string[];
  tableTexts: string[];
  jsonLdTerms?: string[];
}): string {
  return normForMatch(
    [
      input.title,
      input.description,
      ...input.headings,
      ...input.faqQuestions,
      ...input.chunkTexts,
      ...input.tableTexts,
      ...(input.jsonLdTerms ?? []),
    ].join(' '),
  );
}

function appearsOnPage(term: string, corpus: string): boolean {
  const t = normForMatch(term);
  if (!t || t.length < 2) return false;
  return corpus.includes(t);
}

function countBodyContexts(term: string, bodySegments: string[]): number {
  const t = normForMatch(term);
  let count = 0;
  for (const seg of bodySegments) {
    if (normForMatch(seg).includes(t)) count += 1;
  }
  return count;
}

function addCandidate(
  map: Map<string, ScoredCandidate>,
  term: string,
  score: number,
  source: KeywordSource,
  evidence: string,
  opts: { bodyContexts?: number; inTitleOrHeading?: boolean },
) {
  const t = trimToKeyword(term);
  if (!t) return;
  const key = normForMatch(t);
  const prev = map.get(key);
  const bodyContexts = Math.max(prev?.bodyContexts ?? 0, opts.bodyContexts ?? 0);
  const inTitleOrHeading =
    Boolean(prev?.inTitleOrHeading) || Boolean(opts.inTitleOrHeading) || source === 'title' || source === 'heading';

  if (!prev || score > prev.score) {
    map.set(key, {
      term: t,
      score: (prev?.score ?? 0) + score,
      source: prev && prev.score >= score ? prev.source : source,
      evidence: evidence.slice(0, 160),
      bodyContexts,
      inTitleOrHeading,
    });
  } else {
    map.set(key, {
      ...prev,
      score: prev.score + score * 0.35,
      bodyContexts,
      inTitleOrHeading,
      evidence: prev.evidence || evidence.slice(0, 160),
    });
  }
}

function ingestSegments(
  map: Map<string, ScoredCandidate>,
  segments: string[],
  score: number,
  source: KeywordSource,
  corpus: string,
  opts: {
    trackBody?: boolean;
    bodySegments?: string[];
    titleHeadingSet?: Set<string>;
    maxWords?: number;
  },
) {
  const maxWords = opts.maxWords ?? MAX_KEYWORD_WORDS;
  for (const segment of segments) {
    for (const phrase of extractShortPhrases(segment, maxWords)) {
      if (!appearsOnPage(phrase, corpus)) continue;
      const norm = normForMatch(phrase);
      const bodyContexts = opts.trackBody
        ? countBodyContexts(phrase, opts.bodySegments ?? segments)
        : 0;
      const inTitleOrHeading = opts.titleHeadingSet?.has(norm) ?? false;
      const effectiveSource =
        inTitleOrHeading && (source === 'body' || source === 'description')
          ? ('heading' as KeywordSource)
          : source;
      addCandidate(map, phrase, score, effectiveSource, segment, { bodyContexts, inTitleOrHeading });
    }
  }
}

function computeConfidence(c: ScoredCandidate): number {
  let confidence = Math.min(1, c.score);
  if (c.source === 'title' || c.source === 'json_ld') confidence = Math.max(confidence, 0.72);
  else if (c.source === 'heading') confidence = Math.max(confidence, 0.58);
  else if (c.source === 'description') confidence = Math.max(confidence, 0.5);
  if (c.inTitleOrHeading) confidence = Math.min(1, confidence + 0.12);
  if (c.source === 'body' && c.bodyContexts >= 2) confidence = Math.min(1, confidence + 0.1);
  if (c.source === 'body' && !c.inTitleOrHeading && c.bodyContexts < 2) {
    confidence = Math.min(confidence, 0.35);
  }
  return Math.round(confidence * 100) / 100;
}

function isPlaceholderSite(input: {
  title: string;
  description: string;
  headings: string[];
  chunkTexts: string[];
}): boolean {
  const blob = normForMatch([input.title, input.description, ...input.headings, ...input.chunkTexts].join(' '));
  return (
    blob.includes('example domain') ||
    blob.includes('illustrative examples') ||
    (blob.includes('documentation examples') && blob.includes('permission'))
  );
}

/**
 * Extract theme keywords with evidence and confidence.
 * Returns insufficient_topic_evidence when the page lacks reliable theme signals.
 */
export function extractRelevantKeywords(input: {
  title: string;
  description: string;
  headings: string[];
  faqQuestions: string[];
  chunkTexts: string[];
  tableTexts: string[];
  jsonLdTerms?: string[];
  limit?: number;
  minConfidence?: number;
}): KeywordExtractionResult {
  const corpus = buildPageTextCorpus(input);
  const map = new Map<string, ScoredCandidate>();
  const limit = input.limit ?? 18;
  const minConfidence = input.minConfidence ?? MIN_KEYWORD_CONFIDENCE;

  const titleSegs = titleSegments(input.title).flatMap(splitTextSegments);
  const headingSegs = input.headings.flatMap(splitTextSegments);
  const descSegs = splitTextSegments(input.description);
  const faqSegs = input.faqQuestions.flatMap(splitTextSegments);
  const bodySegs = input.chunkTexts.flatMap(splitTextSegments);
  const tableSegs = input.tableTexts.flatMap(splitTextSegments);
  const jsonSegs = (input.jsonLdTerms ?? []).flatMap(splitTextSegments);

  const titleHeadingSet = new Set<string>();
  for (const seg of [...titleSegs, ...headingSegs]) {
    for (const phrase of extractShortPhrases(seg)) {
      titleHeadingSet.add(normForMatch(phrase));
    }
  }

  ingestSegments(map, titleSegs, 0.68, 'title', corpus, { titleHeadingSet });
  ingestSegments(map, headingSegs, 0.46, 'heading', corpus, { titleHeadingSet });
  ingestSegments(map, descSegs, 0.38, 'description', corpus, { titleHeadingSet });
  ingestSegments(map, faqSegs, 0.34, 'faq', corpus, { titleHeadingSet });
  ingestSegments(map, bodySegs.slice(0, 24), 0.28, 'body', corpus, {
    trackBody: true,
    bodySegments: bodySegs,
    titleHeadingSet,
    maxWords: 3,
  });
  ingestSegments(map, tableSegs, 0.24, 'body', corpus, {
    trackBody: true,
    bodySegments: [...bodySegs, ...tableSegs],
    titleHeadingSet,
    maxWords: 3,
  });
  ingestSegments(map, jsonSegs, 0.62, 'json_ld', corpus, { titleHeadingSet });

  const raw: GeoContentKeyword[] = [...map.values()]
    .filter((v) => {
      if (!isValidKeywordTerm(v.term) || !appearsOnPage(v.term, corpus)) return false;
      // Body-only terms need multi-context or title/heading reinforcement
      if (v.source === 'body' && !v.inTitleOrHeading && v.bodyContexts < 2) return false;
      return true;
    })
    .map((v) => {
      const confidence = computeConfidence(v);
      return {
        term: v.term,
        relevance: Math.min(1, Math.round(v.score * 100) / 100),
        confidence,
        source: v.source,
        evidence: v.evidence,
      };
    })
    .filter((k) => (k.confidence ?? 0) >= minConfidence)
    .sort((a, b) => {
      const wa = a.term.split(/\s+/).length;
      const wb = b.term.split(/\s+/).length;
      if (wb !== wa) return wb - wa;
      return (b.confidence ?? 0) - (a.confidence ?? 0) || b.relevance - a.relevance;
    });

  const keywords = pruneSubsumedKeywords(raw).slice(0, limit);
  const highConfidence = keywords.filter((k) => (k.confidence ?? 0) >= 0.55);

  if (isPlaceholderSite(input) || highConfidence.length < MIN_HIGH_CONFIDENCE_KEYWORDS) {
    return {
      keywords: [],
      status: 'insufficient_topic_evidence',
      reason:
        isPlaceholderSite(input)
          ? 'Page looks like placeholder or generic example content.'
          : 'Fewer than 3 high-confidence theme keywords found on this page.',
    };
  }

  return { keywords, status: 'ok' };
}

/** Convenience: keywords array only (empty when insufficient). */
export function extractRelevantKeywordTerms(input: Parameters<typeof extractRelevantKeywords>[0]): string[] {
  const { keywords } = extractRelevantKeywords(input);
  return keywords.map((k) => k.term);
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
    // Keep heading and body as separate segments so n-grams never cross them.
    if (typeof row.heading === 'string' && row.heading.trim()) out.push(row.heading.trim());
    if (typeof row.text === 'string' && row.text.trim()) out.push(row.text.trim());
    if (out.length >= 16) break;
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
