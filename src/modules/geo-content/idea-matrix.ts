import { GEO_CONTENT_FORMATS } from './formats';
import { buildMergedPromptList } from './prompt-templates';
import type { GeoContentFormat, GeoContentPack, GeoContentSection } from './schemas';

function cleanPrompts(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const t = p.trim().replace(/^[-•*\d.]+\s*/, '');
    if (t.length < 4) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

/** One section per content type; merge duplicate formats from model output. */
export function finalizeContentPack(pack: GeoContentPack, keywordTerms: string[]): GeoContentPack {
  const byFormat = new Map<GeoContentFormat, string[]>();

  for (const section of pack.sections) {
    const existing = byFormat.get(section.format) ?? [];
    const legacy = section as GeoContentSection & { keyword?: string; body?: string; title?: string };
    const raw =
      section.prompts ??
      (legacy.body ? [legacy.body] : legacy.title ? [legacy.title] : []);
    byFormat.set(section.format, [...existing, ...cleanPrompts(raw)]);
  }

  const legacyItems = (pack as GeoContentPack & { items?: Array<{ format: GeoContentFormat; prompts?: string[]; body?: string; title?: string }> }).items;
  if (legacyItems?.length) {
    for (const item of legacyItems) {
      const existing = byFormat.get(item.format) ?? [];
      const prompts = item.prompts ?? (item.body ? [item.body] : item.title ? [item.title] : []);
      byFormat.set(item.format, [...existing, ...cleanPrompts(prompts)]);
    }
  }

  const terms = keywordTerms.length > 0 ? keywordTerms : ['this website'];
  const sections: GeoContentSection[] = GEO_CONTENT_FORMATS.map((format) => {
    const merged = cleanPrompts(byFormat.get(format) ?? []);
    const prompts = merged.length >= 5 ? merged : buildMergedPromptList(terms, format);
    return { format, prompts: prompts.slice(0, 12) };
  });

  return { ...pack, sections };
}
