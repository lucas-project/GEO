import { inferMarketFromDomain } from './market-country';

/** Append inferred market/country hint to SERP queries (all brands). */
export function searchQueryWithMarket(base: string, domain: string): string {
  const market = inferMarketFromDomain(domain);
  const region = market?.queryHint?.trim();
  if (!region) return base.trim();
  return `${base.trim()} ${region}`;
}
