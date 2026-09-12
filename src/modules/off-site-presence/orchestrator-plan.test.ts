import { describe, expect, it } from 'vitest';
import { PLATFORM_IDS } from './schemas';
import { resolveHeuristicSearchPlan } from './search-plan';
import { isProbeInPlan } from './platform-registry';

describe('probe plan filtering', () => {
  it('automotive plan excludes g2 and capterra from probe set', () => {
    const plan = resolveHeuristicSearchPlan({
      brand: {
        primaryBrand: 'Ferrari',
        aliases: [],
        confidence: 1,
        needsReview: false,
        sources: [],
        flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
        sameAsUrls: [],
      },
      domain: 'ferrari.com',
      pages: [{ url: 'https://ferrari.com', html: '<title>Ferrari automotive</title>' }],
    });

    expect(isProbeInPlan(plan, 'g2')).toBe(false);
    expect(isProbeInPlan(plan, 'capterra')).toBe(false);
    expect(isProbeInPlan(plan, 'reddit')).toBe(true);

    const skipped = PLATFORM_IDS.filter((id) => !plan.probePlatforms.includes(id));
    expect(skipped).toContain('g2');
    expect(skipped).toContain('capterra');
  });
});
