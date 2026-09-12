/** Loose check: brand override plausibly matches the site hostname. */
export function brandMatchesUrl(brand: string, url: string): boolean {
  const b = brand.trim().toLowerCase();
  if (!b) return true;

  let host = '';
  try {
    host = new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./i, '');
  } catch {
    return true;
  }

  const stem = host.split('.')[0] ?? host;
  if (!stem || stem.length < 2) return true;

  if (stem.includes(b) || b.includes(stem)) return true;

  const bCompact = b.replace(/[^a-z0-9]/g, '');
  const stemCompact = stem.replace(/[^a-z0-9]/g, '');
  if (bCompact.length >= 3 && stemCompact.length >= 3) {
    if (stemCompact.includes(bCompact) || bCompact.includes(stemCompact)) return true;
  }

  return false;
}

export function brandMismatchMessage(brand: string, url: string): string | null {
  if (!brand.trim() || !url.trim()) return null;
  if (brandMatchesUrl(brand, url)) return null;
  return `Brand "${brand.trim()}" may not match this website — clear the brand field or update it before probing.`;
}
