/**
 * JSON-LD schema.org extractor.
 *
 * Recursively walks every <script type="application/ld+json"> block.
 */

import type { CheerioAPI } from 'cheerio';
import type { SchemaBlock } from '../schemas';

export function extractSchemas($: CheerioAPI): SchemaBlock[] {
  const blocks: SchemaBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      flatten(parsed, blocks, new WeakSet<object>());
    } catch {
      // Bad JSON-LD is common; ignore silently rather than fail extraction.
    }
  });
  return blocks;
}

function flatten(value: unknown, out: SchemaBlock[], seen: WeakSet<object>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) flatten(v, out, seen);
    return;
  }
  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) return;
  seen.add(obj);
  if ('@graph' in obj && Array.isArray(obj['@graph'])) {
    for (const v of obj['@graph']) flatten(v, out, seen);
  }
  const t = obj['@type'];
  const types = Array.isArray(t) ? t : [t];
  for (const type of types) {
    if (typeof type === 'string') out.push({ type, raw: obj });
  }
  for (const [key, nested] of Object.entries(obj)) {
    if (key !== '@graph') flatten(nested, out, seen);
  }
}
