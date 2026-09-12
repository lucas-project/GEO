import { detectSiteKeywordsFromPages } from './detect-site-keywords';
import { pageContextFromPages } from './page-context';
import type { EntityPageInput } from './resolve-entity';
import {
  refineSiteKeywordsWithModel,
  shouldRefineSiteKeywords,
} from './refine-site-keywords';

/** Detect + optionally LLM-refine keywords when the UI did not pass them. */
export async function resolveProbeSiteKeywords(input: {
  pages: EntityPageInput[];
  prefetched?: string[];
  llmSearchTerms?: string[];
}): Promise<string[]> {
  const merged: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const k = raw.trim();
    if (!k || k.length < 3) return;
    const lower = k.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    merged.push(k);
  };

  for (const k of input.prefetched ?? []) push(k);
  for (const k of input.llmSearchTerms ?? []) push(k);

  const detected = detectSiteKeywordsFromPages(input.pages);
  if (detected.length >= 3 && shouldRefineSiteKeywords()) {
    const ctx = pageContextFromPages(input.pages);
    const refined = await refineSiteKeywordsWithModel({
      candidates: [...merged, ...detected],
      ...ctx,
    });
    for (const k of refined) push(k);
  } else {
    for (const k of detected) push(k);
  }

  return merged.slice(0, 10);
}
