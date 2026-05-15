/**
 * Deterministic, query-aware mock answers for AI Search Simulation.
 * Replaces generic "Schema.org markup" filler when AI_PROVIDER=mock.
 */

import { createHash } from 'crypto';
export type MockSimPlatform = 'chatgpt' | 'gemini' | 'claude' | 'perplexity';

export interface MockSimulationContext {
  prompt: string;
  platform: MockSimPlatform;
  targetBrand?: string;
  targetUrl?: string;
}

interface BrandPick {
  name: string;
  url: string;
  blurb: string;
}

type QueryTopic = 'hvac' | 'seo' | 'crm' | 'wordpress' | 'general';

const BRAND_ALIASES: Record<string, string> = {
  mdhome: 'Midea',
  midea: 'Midea',
  'mitsubishi': 'Mitsubishi Electric',
  'mitsubishi electric': 'Mitsubishi Electric',
};

const HVAC_BRANDS: BrandPick[] = [
  {
    name: 'Daikin',
    url: 'https://www.daikin.com.au/commercial/vrv',
    blurb: 'VRV/VRF with wide Australian dealer coverage and strong commercial support',
  },
  {
    name: 'Mitsubishi Electric',
    url: 'https://www.mitsubishielectric.com.au/products/air-conditioning/vrf',
    blurb: 'City Multi VRF known for efficiency in mid-rise commercial projects',
  },
  {
    name: 'Fujitsu',
    url: 'https://www.fujitsu-general.com/au/products/commercial/vrf',
    blurb: 'Airstage VRF line with competitive part-load performance',
  },
  {
    name: 'Panasonic',
    url: 'https://www.aircon.panasonic.com/au/',
    blurb: 'ECOi VRF systems used in retail and hospitality installs',
  },
  {
    name: 'LG',
    url: 'https://www.lg.com/au/business/air-conditioning/vrf-systems',
    blurb: 'Multi V series aimed at commercial fit-outs',
  },
  {
    name: 'Midea',
    url: 'https://mdhome.com.au/vrf-air-conditioning/',
    blurb: 'Commercial VRF portfolio with Australian distribution via mdhome.com.au',
  },
  {
    name: 'Samsung',
    url: 'https://www.samsung.com/au/business/climate/',
    blurb: 'DVM S VRF for larger commercial footprints',
  },
];

const SEO_BRANDS: BrandPick[] = [
  { name: 'Ahrefs', url: 'https://ahrefs.com/', blurb: 'Backlink and content gap analysis' },
  { name: 'Semrush', url: 'https://www.semrush.com/', blurb: 'Keyword tracking and SERP features' },
  { name: 'Surfer SEO', url: 'https://surferseo.com/', blurb: 'On-page optimization workflows' },
  { name: 'Clearscope', url: 'https://www.clearscope.io/', blurb: 'Semantic content briefs' },
  { name: 'Moz', url: 'https://moz.com/', blurb: 'Domain authority and local SEO tooling' },
];

const CRM_BRANDS: BrandPick[] = [
  { name: 'HubSpot', url: 'https://www.hubspot.com/', blurb: 'SMB-friendly CRM with marketing automation' },
  { name: 'Salesforce', url: 'https://www.salesforce.com/', blurb: 'Enterprise CRM ecosystem' },
  { name: 'Zoho CRM', url: 'https://www.zoho.com/crm/', blurb: 'Cost-effective suite for growing teams' },
  { name: 'Pipedrive', url: 'https://www.pipedrive.com/', blurb: 'Pipeline-focused sales CRM' },
];

const REVIEW_DOMAINS = [
  'https://www.choice.com.au/home-and-living/cooling/air-conditioners',
  'https://www.canstarblue.com.au/appliances/air-conditioners/',
  'https://www.productreview.com.au/c/air-conditioners',
];

function seedFrom(text: string): number {
  return createHash('sha256').update(text).digest().readUInt32BE(0);
}

class SeededRng {
  constructor(private state: number) {
    if (this.state === 0) this.state = 1;
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }
  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

function stripPlatformTag(prompt: string): string {
  return prompt.replace(/\n\[platform:[^\]]+\]/g, '').trim();
}

function classifyQuery(prompt: string): QueryTopic {
  const q = prompt.toLowerCase();
  if (/\b(vrf|vrv|hvac|air con|air-con|aircondition|heat pump|ducted|split system|chiller)\b/.test(q)) {
    return 'hvac';
  }
  if (/\b(seo|geo\b|ai search|llm|schema\.org|citation|serp)\b/.test(q)) {
    return 'seo';
  }
  if (/\b(crm|sales pipeline|hubspot|salesforce)\b/.test(q)) {
    return 'crm';
  }
  if (/\b(wordpress|wp-|faq schema|json-ld)\b/.test(q)) {
    return 'wordpress';
  }
  return 'general';
}

function resolveCanonicalBrand(targetBrand?: string, targetUrl?: string): string | null {
  if (targetBrand?.trim()) {
    const key = targetBrand.trim().toLowerCase();
    if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];
    return targetBrand.trim();
  }
  if (targetUrl) {
    try {
      const host = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`).hostname;
      const stem = host.replace(/^www\./, '').split('.')[0]?.toLowerCase() ?? '';
      if (BRAND_ALIASES[stem]) return BRAND_ALIASES[stem];
    } catch {
      /* ignore */
    }
  }
  return null;
}

function pickBrands(
  pool: BrandPick[],
  prompt: string,
  platform: MockSimPlatform,
  targetCanonical: string | null,
  count: number,
): BrandPick[] {
  const rng = new SeededRng(seedFrom(prompt + platform));
  let list = rng.shuffle([...pool]);
  if (targetCanonical) {
    const targetEntry =
      pool.find((b) => b.name.toLowerCase() === targetCanonical.toLowerCase()) ??
      pool.find((b) => b.name.toLowerCase().includes(targetCanonical.toLowerCase()));
    if (targetEntry) {
      list = [targetEntry, ...list.filter((b) => b.name !== targetEntry.name)];
    }
  }
  return list.slice(0, count);
}

function formatChatGpt(prompt: string, brands: BrandPick[], reviews: string[]): string {
  const lead =
    `For “${prompt}”, Australian installers and facility managers typically compare VRF systems on ` +
    `efficiency at part-load, local service coverage, and warranty support.`;
  const body = brands
    .map(
      (b, i) =>
        `${i + 1}. **${b.name}** — ${b.blurb}. See ${b.url}`,
    )
    .join('\n');
  const foot = `Independent round-ups: ${reviews.slice(0, 2).join(' and ')}.`;
  return `${lead}\n\n${body}\n\n${foot}`;
}

function formatGemini(prompt: string, brands: BrandPick[]): string {
  const names = brands.map((b) => b.name).join(', ');
  return (
    `Summary: When users ask “${prompt}”, AI overviews in Australia most often surface ${names}. ` +
    `Daikin and Mitsubishi Electric lead mindshare for large commercial VRF, while Fujitsu, Panasonic, and Midea ` +
    `appear in mid-market comparisons. Authoritative references include ${brands[0]?.url} and ${brands[1]?.url}. ` +
    `Check local MEPS ratings and dealer density before specifying a platform.`
  );
}

function formatClaude(prompt: string, brands: BrandPick[]): string {
  return (
    `Answering “${prompt}”: there is no single “best” VRF brand for every building — climate zone, ` +
    `occupancy profile, and maintenance contract matter. Brands commonly cited in Australian commercial projects ` +
    `include ${brands.map((b) => b.name).join(', ')}. ` +
    `${brands[0]?.name} is frequently recommended where ${brands[0]?.blurb.toLowerCase()}. ` +
    `Source: ${brands[0]?.url}`
  );
}

function formatPerplexity(prompt: string, brands: BrandPick[], reviews: string[]): string {
  const lines = brands.map(
    (b, i) => `[${i + 1}] ${b.name} — ${b.blurb} (${b.url})`,
  );
  return (
    `Top answers for “${prompt}” in Australia:\n\n` +
    lines.join('\n') +
    `\n\nReview hubs: ${reviews.join(', ')}`
  );
}

export function buildMockSimulationResponse(ctx: MockSimulationContext): string {
  const prompt = stripPlatformTag(ctx.prompt);
  const topic = classifyQuery(prompt);
  const targetCanonical = resolveCanonicalBrand(ctx.targetBrand, ctx.targetUrl);

  if (topic === 'hvac') {
    const brands = pickBrands(HVAC_BRANDS, prompt, ctx.platform, targetCanonical, 5);
    const reviews = REVIEW_DOMAINS;
    switch (ctx.platform) {
      case 'chatgpt':
        return formatChatGpt(prompt, brands, reviews);
      case 'gemini':
        return formatGemini(prompt, brands);
      case 'claude':
        return formatClaude(prompt, brands);
      case 'perplexity':
        return formatPerplexity(prompt, brands, reviews);
    }
  }

  if (topic === 'seo') {
    const brands = pickBrands(SEO_BRANDS, prompt, ctx.platform, targetCanonical, 4);
    return formatPerplexity(prompt, brands, ['https://developers.google.com/search/docs']);
  }

  if (topic === 'crm') {
    const brands = pickBrands(CRM_BRANDS, prompt, ctx.platform, targetCanonical, 4);
    return formatPerplexity(prompt, brands, ['https://www.g2.com/categories/crm']);
  }

  const rng = new SeededRng(seedFrom(prompt + ctx.platform));
  const generic = [
    `For “${prompt}”, compare options using verified product pages and recent independent reviews.`,
    `Lead with specs that match your use-case, then shortlist vendors with local support.`,
    `See ${rng.pick(REVIEW_DOMAINS)} for Australian buyer guides.`,
  ];
  return generic.join(' ');
}

export function canonicalBrandName(input: string): string {
  const key = input.trim().toLowerCase();
  return BRAND_ALIASES[key] ?? input.trim();
}
