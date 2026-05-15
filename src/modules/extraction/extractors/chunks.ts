/**
 * Semantic-chunk extractor.
 *
 * Splits the page's main content into heading-delimited chunks. Each chunk
 * is evaluated for AI-friendly properties (answer-first sentence, list,
 * numeric facts) which the GEO Audit later scores.
 */

import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { SemanticChunk } from '../schemas';

const ANSWER_FIRST_OPENERS = [
  /^the\b/i,
  /^a\b/i,
  /^an\b/i,
  /^in\b/i,
  /^there\b/i,
  /^yes\b/i,
  /^no\b/i,
  /^to\b/i,
  /^this\b/i,
  /^you\b/i,
  /^it\b/i,
];

function pickMainRoot($: CheerioAPI): Cheerio<AnyNode> {
  const candidates = ['main', 'article', '[role="main"]'];
  for (const sel of candidates) {
    const found = $(sel).first();
    if (found.length) return found as Cheerio<AnyNode>;
  }
  return $('body') as Cheerio<AnyNode>;
}

function isAnswerFirst(text: string): boolean {
  const firstSentence = text.split(/[.!?]\s/)[0]?.trim() ?? '';
  if (firstSentence.length < 20 || firstSentence.length > 320) return false;
  return ANSWER_FIRST_OPENERS.some((re) => re.test(firstSentence));
}

export function extractChunks($: CheerioAPI): SemanticChunk[] {
  const main = pickMainRoot($);
  const chunks: SemanticChunk[] = [];

  const blocks = main.find('h1, h2, h3, p, ul, ol, table');
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  let hasList = false;
  let hasNumbers = false;

  const flush = () => {
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length < 60) {
      buffer = [];
      hasList = false;
      hasNumbers = false;
      return;
    }
    const wordCount = text.split(/\s+/).length;
    chunks.push({
      id: 'chunk-' + chunks.length.toString().padStart(3, '0'),
      heading: currentHeading,
      text: text.slice(0, 2400),
      wordCount,
      hasAnswerFirstSentence: isAnswerFirst(text),
      hasList,
      hasNumbers,
    });
    buffer = [];
    hasList = false;
    hasNumbers = false;
  };

  blocks.each((_, el) => {
    const $el = $(el);
    const tag = (el as Element).tagName?.toLowerCase();
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (!text) return;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      flush();
      currentHeading = text;
      return;
    }

    if (tag === 'ul' || tag === 'ol') hasList = true;
    if (/\d/.test(text)) hasNumbers = true;
    buffer.push(text);
  });

  flush();
  return chunks.slice(0, 40);
}
