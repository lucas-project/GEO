import type { SchemaBlock } from '@modules/extraction';

const ORG_TYPES = new Set([
  'Organization',
  'LocalBusiness',
  'Corporation',
  'OnlineBusiness',
  'WebSite',
]);

function collectUrls(value: unknown, out: Set<string>): void {
  if (!value) return;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) out.add(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out);
  }
}

export function extractSameAsUrls(schemas: SchemaBlock[]): string[] {
  const urls = new Set<string>();

  for (const block of schemas) {
    if (!ORG_TYPES.has(block.type)) continue;
    const raw = block.raw as Record<string, unknown>;
    if (raw.sameAs) collectUrls(raw.sameAs, urls);
  }

  return [...urls];
}
