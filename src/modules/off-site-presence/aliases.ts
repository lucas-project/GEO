import { canonicalBrandName } from '@modules/ai-simulation/mock-responses';

/** Search variants: spaced, collapsed, canonical. */
export function buildBrandAliases(primaryBrand: string): string[] {
  const canonical = canonicalBrandName(primaryBrand);
  const trimmed = canonical.trim();
  const out = new Set<string>();
  if (trimmed) out.add(trimmed);
  const collapsed = trimmed.replace(/\s+/g, '');
  if (collapsed && collapsed !== trimmed) out.add(collapsed);
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (slug && slug.length >= 2) out.add(slug);
  return [...out];
}

export function slugifyBrand(brand: string): string {
  return brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeDomain(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl.replace(/^www\./, '');
  }
}
