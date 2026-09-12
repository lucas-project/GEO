import type { MarketCountry } from './market-country';

/** Build Reddit search queries from brand + product keywords (no brand-specific hacks). */

export function buildRedditPostSearchQueries(input: {
  brand: string;
  aliases: string[];
  planKeywords: string[];
  marketCountry?: MarketCountry | null;
}): { postQueries: string[]; communityQueries: string[] } {
  const postQueries: string[] = [];
  const seen = new Set<string>();

  const add = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 4) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    postQueries.push(trimmed);
  };

  const region = input.marketCountry?.queryHint?.trim();

  for (const kw of input.planKeywords) {
    const k = kw.trim();
    if (k.length < 4) continue;
    if (k.includes(' ')) {
      add(`"${k}"`);
      if (region) add(`"${k}" ${region}`);
    } else if (k.length >= 6) {
      add(k);
      if (region) add(`${k} ${region}`);
    }
  }

  const brand = input.brand.trim();
  if (brand.length >= 3) add(brand);

  for (const alias of input.aliases.slice(0, 3)) {
    const a = alias.trim();
    if (a.length >= 4) add(a);
  }

  return {
    postQueries: postQueries.slice(0, 12),
    communityQueries: postQueries.slice(0, 4),
  };
}
