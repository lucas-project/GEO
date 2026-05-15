/**
 * FAQ extractor — tries three strategies:
 *  1. schema.org FAQPage / Question/Answer blocks (most reliable)
 *  2. <details><summary> patterns
 *  3. heuristic: a heading ending in "?" followed by text
 */

import type { CheerioAPI } from 'cheerio';
import type { FaqEntry, SchemaBlock } from '../schemas';

export function extractFaqs($: CheerioAPI, schemas: SchemaBlock[]): FaqEntry[] {
  const out: FaqEntry[] = [];

  for (const block of schemas) {
    if (!block.raw || typeof block.raw !== 'object') continue;
    const raw = block.raw as Record<string, unknown>;
    if (block.type === 'FAQPage' || block.type === 'QAPage') {
      const main = raw.mainEntity;
      const list = Array.isArray(main) ? main : main ? [main] : [];
      for (const q of list) {
        if (!q || typeof q !== 'object') continue;
        const qObj = q as Record<string, unknown>;
        const question = typeof qObj.name === 'string' ? qObj.name : null;
        const accepted = qObj.acceptedAnswer;
        let answer: string | null = null;
        if (accepted && typeof accepted === 'object') {
          const a = accepted as Record<string, unknown>;
          if (typeof a.text === 'string') answer = a.text;
        }
        if (question && answer) {
          out.push({ question, answer, source: 'schema' });
        }
      }
    } else if (block.type === 'Question' && typeof raw.name === 'string') {
      const accepted = raw.acceptedAnswer;
      const answer =
        accepted && typeof accepted === 'object'
          ? (accepted as { text?: unknown }).text
          : undefined;
      if (typeof answer === 'string') {
        out.push({ question: raw.name, answer, source: 'schema' });
      }
    }
  }

  $('details').each((_, el) => {
    const $el = $(el);
    const question = $el.find('summary').first().text().trim();
    const $clone = $el.clone();
    $clone.find('summary').remove();
    const answer = $clone.text().replace(/\s+/g, ' ').trim();
    if (question && answer && question.length < 300 && answer.length < 4000) {
      out.push({ question, answer, source: 'details' });
    }
  });

  $('h2, h3, h4').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (!text.endsWith('?')) return;
    if (text.length > 240) return;
    let $next = $el.next();
    const parts: string[] = [];
    let safety = 0;
    while ($next.length && !/^h[1-6]$/i.test($next.prop('tagName') ?? '') && safety < 6) {
      const t = $next.text().replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
      $next = $next.next();
      safety++;
    }
    const answer = parts.join(' ').slice(0, 2000);
    if (answer.length >= 40) {
      out.push({ question: text, answer, source: 'heuristic' });
    }
  });

  const seen = new Set<string>();
  return out.filter((f) => {
    const key = f.question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
