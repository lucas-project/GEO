/** Prefer LLM-curated posts, then backfill from full search/probe merge so SERP hits still display. */
export function mergeCuratedWithCandidates<T extends { url?: string; title: string }>(
  curated: T[],
  candidates: T[],
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const key = (p: T) => (p.url?.trim().toLowerCase() || p.title.trim().toLowerCase());
  for (const p of curated) {
    const k = key(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  for (const p of candidates) {
    const k = key(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
