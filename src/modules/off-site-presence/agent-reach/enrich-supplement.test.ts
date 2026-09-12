import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchSupplementResult } from '../search-supplement';
import type { BrandEntityResult } from '../schemas';

vi.mock('@shared/config', () => ({
  config: {
    presenceProbe: {
      agentReachEnabled: true,
      agentReachXhs: true,
      agentReachRdt: false,
      agentReachJina: false,
      agentReachTimeoutMs: 5000,
      xhsCli: 'xhs',
      rdtCli: 'rdt',
    },
  },
}));

vi.mock('./health', () => ({
  probeAgentReachHealth: vi.fn(async () => ({
    xhs: 'ok',
    rdt: 'skipped',
    jina: 'skipped',
  })),
}));

vi.mock('./xiaohongshu-search', () => ({
  searchXiaohongshuViaCli: vi.fn(async () => ({
    hits: [
      {
        url: 'https://www.xiaohongshu.com/explore/abc',
        title: 'Brand note',
        engine: 'xhs-cli' as const,
      },
    ],
    query: 'xhs:Brand',
  })),
}));

import { enrichSearchSupplementWithAgentReach } from './enrich-supplement';

const brand: BrandEntityResult = {
  primaryBrand: 'Acme',
  aliases: [],
  confidence: 0.9,
  needsReview: false,
  sources: [],
  flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
  sameAsUrls: [],
};

function emptySupplement(): SearchSupplementResult {
  return {
    queries: [],
    byPlatform: {},
    social: [],
    facebookPosts: [],
    crossPlatformPosts: {},
    offSiteDomains: [],
    discoveryDomains: [],
    generalHitEstimate: 0,
    verticalHits: {},
    verticalDomains: [],
  };
}

describe('enrichSearchSupplementWithAgentReach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges xhs hits into crossPlatformPosts', async () => {
    const result = await enrichSearchSupplementWithAgentReach(emptySupplement(), {
      brand,
      domain: 'acme.com',
      keywords: ['widget'],
    });
    expect(result.crossPlatformPosts.xiaohongshu?.length).toBe(1);
    expect(result.agentReach?.xhsHitsAdded).toBe(1);
    expect(result.queries.some((q) => q.engine === 'xhs-cli')).toBe(true);
  });
});
