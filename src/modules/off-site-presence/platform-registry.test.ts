import { describe, expect, it } from 'vitest';
import {
  platformsForCategory,
  searchTargetsForCategory,
  skipPlatformsForCategory,
} from './platform-registry';

describe('local_service platform registry', () => {
  it('excludes g2, capterra, and trustpilot from probes and search targets', () => {
    const probes = platformsForCategory('local_service');
    const targets = searchTargetsForCategory('local_service');
    const skips = skipPlatformsForCategory('local_service').map((s) => s.id);

    expect(probes).not.toContain('g2');
    expect(probes).not.toContain('capterra');
    expect(probes).not.toContain('trustpilot');
    expect(probes).toContain('reddit');

    expect(targets).not.toContain('g2');
    expect(targets).not.toContain('capterra');
    expect(targets).not.toContain('trustpilot');
    expect(targets).toContain('news');
    expect(targets).toContain('general');

    expect(skips).toEqual(expect.arrayContaining(['g2', 'capterra', 'trustpilot']));
  });
});
