import { describe, expect, it } from 'vitest';
import { buildMockGeoContentPack } from './mock-pack';

describe('buildMockGeoContentPack', () => {
  it('reads only the explicit keyword block and does not inject an HVAC fallback', () => {
    const pack = buildMockGeoContentPack(`Target website: https://www.python.org
Page title (context only): Welcome to Python.org

Headings:
- Documentation
- Community

BEGIN_SITE_KEYWORDS
- Python programming
- Data types
END_SITE_KEYWORDS

Create exactly 6 sections.
- ducted vs split`);

    const prompts = pack.sections.flatMap((section) => section.prompts).join('\n').toLowerCase();
    expect(prompts).toContain('python programming');
    expect(prompts).not.toMatch(/hvac|ducted|split system|refrigerant|outdoor unit|installation/);
  });
});
