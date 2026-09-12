/** Normalize brand string for search queries (e.g. ferrari → Ferrari). */
export function toSearchBrandLabel(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9-]*$/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed;
}
