/**
 * Infer primary market from the scanned site hostname (ccTLD / regional TLD).
 * Used to prioritize Reddit threads and search queries for the same geography.
 */

export type MarketCountry = {
  code: string;
  name: string;
  /** Words that suggest a thread is about this market (title/subreddit). */
  hints: string[];
  /** Short suffix for Reddit search queries, e.g. "Australia". */
  queryHint: string;
  source: 'domain';
};

type MarketDef = Omit<MarketCountry, 'source'>;

/** Longest suffixes first so `example.com.au` matches before `au`. */
const SUFFIX_MARKETS: Array<{ suffix: string; market: MarketDef }> = [
  {
    suffix: 'com.au',
    market: {
      code: 'AU',
      name: 'Australia',
      queryHint: 'Australia',
      hints: [
        'australia',
        'australian',
        'aussie',
        'aus',
        'sydney',
        'melbourne',
        'brisbane',
        'perth',
        'adelaide',
        'queensland',
        'victoria',
        'nsw',
        'wa',
        'qld',
        'vic',
      ],
    },
  },
  {
    suffix: 'co.nz',
    market: {
      code: 'NZ',
      name: 'New Zealand',
      queryHint: 'New Zealand',
      hints: ['new zealand', 'nz', 'auckland', 'wellington', 'christchurch'],
    },
  },
  {
    suffix: 'co.uk',
    market: {
      code: 'GB',
      name: 'United Kingdom',
      queryHint: 'UK',
      hints: ['uk', 'united kingdom', 'britain', 'british', 'england', 'london', 'scotland', 'wales'],
    },
  },
  {
    suffix: 'com.br',
    market: {
      code: 'BR',
      name: 'Brazil',
      queryHint: 'Brazil',
      hints: ['brazil', 'brasil', 'brazilian', 'são paulo', 'sao paulo', 'rio'],
    },
  },
  {
    suffix: 'com.mx',
    market: {
      code: 'MX',
      name: 'Mexico',
      queryHint: 'Mexico',
      hints: ['mexico', 'mexican', 'cdmx', 'monterrey'],
    },
  },
  {
    suffix: 'com.sg',
    market: {
      code: 'SG',
      name: 'Singapore',
      queryHint: 'Singapore',
      hints: ['singapore', 'sg'],
    },
  },
  {
    suffix: 'co.in',
    market: {
      code: 'IN',
      name: 'India',
      queryHint: 'India',
      hints: ['india', 'indian', 'mumbai', 'delhi', 'bangalore', 'bengaluru'],
    },
  },
  {
    suffix: 'co.za',
    market: {
      code: 'ZA',
      name: 'South Africa',
      queryHint: 'South Africa',
      hints: ['south africa', 'johannesburg', 'cape town'],
    },
  },
  {
    suffix: 'com.hk',
    market: {
      code: 'HK',
      name: 'Hong Kong',
      queryHint: 'Hong Kong',
      hints: ['hong kong', 'hk'],
    },
  },
  {
    suffix: 'com.cn',
    market: {
      code: 'CN',
      name: 'China',
      queryHint: 'China',
      hints: ['china', 'chinese', 'beijing', 'shanghai', '小红书', '知乎'],
    },
  },
  {
    suffix: 'cn',
    market: {
      code: 'CN',
      name: 'China',
      queryHint: 'China',
      hints: ['china', 'chinese', 'beijing', 'shanghai', '小红书', '知乎'],
    },
  },
];

const SINGLE_TLD_MARKETS: Record<string, MarketDef> = {
  de: {
    code: 'DE',
    name: 'Germany',
    queryHint: 'Germany',
    hints: ['germany', 'german', 'deutschland', 'berlin', 'munich', 'münchen'],
  },
  fr: {
    code: 'FR',
    name: 'France',
    queryHint: 'France',
    hints: ['france', 'french', 'paris'],
  },
  es: {
    code: 'ES',
    name: 'Spain',
    queryHint: 'Spain',
    hints: ['spain', 'spanish', 'madrid', 'barcelona'],
  },
  it: {
    code: 'IT',
    name: 'Italy',
    queryHint: 'Italy',
    hints: ['italy', 'italian', 'rome', 'milan'],
  },
  nl: {
    code: 'NL',
    name: 'Netherlands',
    queryHint: 'Netherlands',
    hints: ['netherlands', 'dutch', 'amsterdam'],
  },
  ca: {
    code: 'CA',
    name: 'Canada',
    queryHint: 'Canada',
    hints: ['canada', 'canadian', 'toronto', 'vancouver', 'montreal'],
  },
  au: {
    code: 'AU',
    name: 'Australia',
    queryHint: 'Australia',
    hints: ['australia', 'australian', 'aussie', 'sydney', 'melbourne'],
  },
  uk: {
    code: 'GB',
    name: 'United Kingdom',
    queryHint: 'UK',
    hints: ['uk', 'united kingdom', 'british', 'london'],
  },
  in: {
    code: 'IN',
    name: 'India',
    queryHint: 'India',
    hints: ['india', 'indian', 'mumbai', 'delhi'],
  },
  br: {
    code: 'BR',
    name: 'Brazil',
    queryHint: 'Brazil',
    hints: ['brazil', 'brasil', 'brazilian'],
  },
  mx: {
    code: 'MX',
    name: 'Mexico',
    queryHint: 'Mexico',
    hints: ['mexico', 'mexican'],
  },
  jp: {
    code: 'JP',
    name: 'Japan',
    queryHint: 'Japan',
    hints: ['japan', 'japanese', 'tokyo'],
  },
  kr: {
    code: 'KR',
    name: 'South Korea',
    queryHint: 'Korea',
    hints: ['korea', 'korean', 'seoul'],
  },
};

function normalizeHost(domainOrUrl: string): string {
  const raw = domainOrUrl.trim().toLowerCase();
  try {
    if (raw.includes('://')) {
      return new URL(raw).hostname.replace(/^www\./, '');
    }
  } catch {
    /* bare domain */
  }
  return raw.replace(/^www\./, '').split('/')[0] ?? raw;
}

export function inferMarketFromDomain(domainOrUrl: string): MarketCountry | null {
  const host = normalizeHost(domainOrUrl);
  if (!host) return null;

  for (const { suffix, market } of SUFFIX_MARKETS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { ...market, source: 'domain' };
    }
  }

  const parts = host.split('.');
  const tld = parts[parts.length - 1];
  if (tld && SINGLE_TLD_MARKETS[tld] && parts.length >= 2) {
    const second = parts[parts.length - 2];
    if (second && second !== 'com' && second !== 'co' && second !== 'org' && second !== 'net') {
      return { ...SINGLE_TLD_MARKETS[tld], source: 'domain' };
    }
    if (parts.length === 2) {
      return { ...SINGLE_TLD_MARKETS[tld], source: 'domain' };
    }
  }

  return null;
}

/** Strong cues that a thread is about another major market (not exhaustive). */
const OUT_OF_MARKET_HINTS: Partial<Record<string, string[]>> = {
  AU: [
    'texas',
    'california',
    'florida',
    'usa',
    'u.s.',
    'united states',
    'american',
    'new york',
    'chicago',
    'canada',
    'canadian',
    'toronto',
    'uk only',
    'united kingdom',
    'london uk',
  ],
  NZ: ['australia', 'australian', 'sydney', 'texas', 'usa', 'united states', 'american'],
  GB: ['australia', 'australian', 'sydney', 'texas', 'usa', 'united states', 'american', 'california'],
  US: ['australia', 'australian', 'sydney', 'uk', 'united kingdom', 'london', 'germany', 'german'],
};

/** 2 = clear market match, 1 = neutral, 0 = likely another region. */
export function scoreRedditPostMarketRelevance(
  post: { title: string; subreddit?: string },
  market: MarketCountry,
): number {
  const blob = `${post.title} ${post.subreddit ?? ''}`.toLowerCase();

  const outOfMarket = OUT_OF_MARKET_HINTS[market.code];
  if (outOfMarket?.some((h) => blob.includes(h))) return 0;

  if (market.hints.some((h) => blob.includes(h))) return 2;

  for (const { market: m } of SUFFIX_MARKETS) {
    if (m.code === market.code) continue;
    if (m.hints.some((h) => h.length >= 5 && blob.includes(h))) return 0;
  }
  for (const m of Object.values(SINGLE_TLD_MARKETS)) {
    if (m.code === market.code) continue;
    if (m.hints.some((h) => h.length >= 5 && blob.includes(h))) return 0;
  }

  return 1;
}

export function partitionRedditPostsByMarket<T extends { title: string; subreddit?: string }>(
  posts: T[],
  market: MarketCountry | null | undefined,
): { primary: T[]; other: T[] } {
  if (!market) return { primary: posts, other: [] };

  const primary: T[] = [];
  const other: T[] = [];
  for (const p of posts) {
    const score = scoreRedditPostMarketRelevance(p, market);
    if (score >= 1) primary.push(p);
    else other.push(p);
  }
  return { primary, other };
}
