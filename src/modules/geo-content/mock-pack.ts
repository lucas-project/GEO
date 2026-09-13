import { isValidKeywordTerm, trimToKeyword, type GeoContentKeyword } from './keywords';
import { packFromFallback } from './prompts';

export function buildMockGeoContentPack(prompt: string) {
  const urlMatch = prompt.match(/Target website: (.+)/);
  const titleMatch = prompt.match(/Page title \(context only\): ([^\n]+)/);
  const url = urlMatch?.[1]?.trim() ?? 'https://example.com';
  const title = titleMatch?.[1]?.trim() ?? '';

  const keywordBlock = prompt.match(/BEGIN_SITE_KEYWORDS\s*\n([\s\S]*?)\nEND_SITE_KEYWORDS/);
  const terms: string[] = [];
  for (const m of (keywordBlock?.[1] ?? '').matchAll(/^- (.+)$/gm)) {
    const t = trimToKeyword(m[1]?.trim() ?? '');
    if (t && isValidKeywordTerm(t) && !terms.includes(t)) terms.push(t);
  }

  const keywords: GeoContentKeyword[] = terms.map((term, i) => ({
    term,
    relevance: Math.max(0.5, 1 - i * 0.08),
    source: 'body',
  }));

  return packFromFallback({
    url,
    title,
    keywords: keywords.length > 0 ? keywords : [{ term: 'this topic', relevance: 0.5, source: 'body' }],
  });
}
