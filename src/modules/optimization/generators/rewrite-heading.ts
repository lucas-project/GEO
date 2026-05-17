/**
 * Resolve a human section heading for rewrites (never a bare domain).
 */

export function isDomainLike(value: string): boolean {
  const t = value.trim();
  if (!t || t.includes(' ')) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(t);
}

export function headingFromHighlightLabel(label: string): string | undefined {
  const m = label.match(/^Section:\s*(.+)$/i);
  const h = (m?.[1] ?? label).trim();
  if (!h || isDomainLike(h) || h.length > 120) return undefined;
  return h;
}

export function resolveRewriteHeading(input: {
  heading?: string | null;
  highlightLabel?: string;
  fallbackTitle?: string;
}): string | undefined {
  const explicit = input.heading?.trim();
  if (explicit && !isDomainLike(explicit)) return explicit;

  if (input.highlightLabel) {
    const fromLabel = headingFromHighlightLabel(input.highlightLabel);
    if (fromLabel) return fromLabel;
  }

  const fallback = input.fallbackTitle?.trim();
  if (fallback && !isDomainLike(fallback) && fallback.length <= 120) return fallback;

  return undefined;
}
