import type { PlatformId } from './schemas';
import type { SearchHit } from './search-engine';
import { isProbeInPlan } from './platform-registry';
import type { PresenceSearchPlan } from './search-plan-types';
import { toSearchBrandLabel } from './search-brand';

/** Canonical probe URLs when SERP returns no hits (feeds supplement deep-fetch). */
export function seedDirectPlatformHits(
  brand: string,
  domain: string,
  plan: PresenceSearchPlan,
): Partial<Record<PlatformId, SearchHit[]>> {
  const label = toSearchBrandLabel(brand);
  const q = encodeURIComponent(label);
  const host = domain.replace(/^www\./, '');

  const all: Partial<Record<PlatformId, SearchHit[]>> = {
    g2: [
      {
        url: `https://www.g2.com/search?query=${q}`,
        engine: 'bing',
        title: `${label} on G2`,
      },
    ],
    capterra: [
      {
        url: `https://www.capterra.com/search/?search=${q}`,
        engine: 'bing',
        title: `${label} on Capterra`,
      },
    ],
    trustpilot: [
      {
        url: `https://www.trustpilot.com/review/${host}`,
        engine: 'bing',
        title: `Trustpilot reviews for ${host}`,
      },
    ],
    quora: [
      {
        url: `https://www.quora.com/topic/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        engine: 'bing',
        title: `${label} on Quora`,
      },
    ],
  };

  const out: Partial<Record<PlatformId, SearchHit[]>> = {};
  for (const id of ['g2', 'capterra', 'trustpilot', 'quora'] as PlatformId[]) {
    if (isProbeInPlan(plan, id) && all[id]) {
      out[id] = all[id];
    }
  }

  if (host.endsWith('.au')) {
    const auSeeds: Partial<Record<PlatformId, SearchHit[]>> = {
      whirlpool: [
        {
          url: `https://forums.whirlpool.net.au/search/?q=${q}`,
          engine: 'bing',
          title: `${label} on Whirlpool Forums`,
        },
      ],
      productreview: [
        {
          url: `https://www.productreview.com.au/listings/search?q=${q}`,
          engine: 'bing',
          title: `${label} on ProductReview.com.au`,
        },
      ],
      ozbargain: [
        {
          url: `https://www.ozbargain.com.au/search/node/${q}`,
          engine: 'bing',
          title: `${label} on OzBargain`,
        },
      ],
    };
    for (const id of ['whirlpool', 'productreview', 'ozbargain'] as PlatformId[]) {
      if (isProbeInPlan(plan, id) && auSeeds[id]) {
        out[id] = auSeeds[id];
      }
    }
  }

  return out;
}
