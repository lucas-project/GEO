/** Merge workspace + plan keywords for Reddit curation and search (deduped, max 12). */
export function mergeRedditCurationKeywords(
  siteKeywords: string[] | undefined,
  planKeywords: string[] | undefined,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(siteKeywords ?? []), ...(planKeywords ?? [])]) {
    const k = raw.trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(k);
    if (merged.length >= 12) break;
  }
  return merged;
}
