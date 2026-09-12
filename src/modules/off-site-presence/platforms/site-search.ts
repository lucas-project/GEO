import type { PlatformProbeResult } from '../schemas';
import { runBingDdgSearch } from '../search-engine';
import type { ProbeContext } from './types';

function aggregateFromSupplement(ctx: ProbeContext): {
  estimate: number;
  domains: string[];
  searchHits: { url: string; title?: string }[];
} | null {
  const supplement = ctx.searchSupplement;
  if (!supplement) return null;

  const domains = new Set<string>(supplement.offSiteDomains);
  let estimate = supplement.generalHitEstimate;
  const searchHits: { url: string; title?: string }[] = [];

  for (const hits of Object.values(supplement.byPlatform)) {
    if (hits?.length) estimate = Math.max(estimate, hits.length);
    for (const h of hits ?? []) {
      try {
        domains.add(new URL(h.url).hostname.replace(/^www\./, ''));
        searchHits.push({ url: h.url, title: h.title });
      } catch {
        /* skip */
      }
    }
  }

  for (const hits of Object.values(supplement.verticalHits ?? {})) {
    if (hits?.length) estimate = Math.max(estimate, hits.length);
    for (const h of hits) {
      try {
        domains.add(new URL(h.url).hostname.replace(/^www\./, ''));
        searchHits.push({ url: h.url, title: h.title });
      } catch {
        /* skip */
      }
    }
  }

  estimate = Math.max(estimate, domains.size);

  if (estimate === 0 && domains.size === 0) return null;
  return { estimate, domains: [...domains], searchHits };
}

function siteSearchStatus(estimate: number, domainCount: number): PlatformProbeResult['status'] {
  if (estimate >= 3 || domainCount >= 3) return 'ok';
  if (estimate > 0 || domainCount > 0) return 'limited_data';
  return 'unreachable';
}

export async function probeSiteSearch(ctx: ProbeContext): Promise<PlatformProbeResult> {
  const aggregated = aggregateFromSupplement(ctx);
  if (aggregated) {
    return {
      platform: 'site_search',
      status: siteSearchStatus(aggregated.estimate, aggregated.domains.length),
      signals: { searchHitEstimate: aggregated.estimate },
      raw: {
        topDomains: aggregated.domains.slice(0, 10),
        searchHits: aggregated.searchHits.slice(0, 8),
        source: 'targeted-search-supplement',
      },
      message: 'Aggregated from platform-specific search supplement',
    };
  }

  const brand = ctx.brand.primaryBrand;
  const domain = ctx.domain.replace(/^www\./, '');
  const query = `"${brand}" -site:${domain}`;

  const { hits, engine } = await runBingDdgSearch(query, ctx.fetchPage, {
    httpOnly: true,
    engines: ['bing'],
  });

  if (hits.length > 0) {
    const domains = [
      ...new Set(
        hits.map((h) => {
          try {
            return new URL(h.url).hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        }),
      ),
    ].filter(Boolean);

    return {
      platform: 'site_search',
      status: 'ok',
      signals: { searchHitEstimate: hits.length },
      raw: { topDomains: domains, engine, searchHits: hits.slice(0, 8) },
    };
  }

  return {
    platform: 'site_search',
    status: 'unreachable',
    signals: {},
    message: 'Web search footprint could not be estimated',
  };
}
