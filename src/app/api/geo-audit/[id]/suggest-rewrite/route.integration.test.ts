import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@modules/geo-audit/server', () => ({
  getAudit: vi.fn().mockResolvedValue({
    id: 'a1',
    url: 'https://mdhome.com.au',
    overallScore: 50,
    dimensions: {},
    narrative: '',
    topIssues: [],
    topFixes: [],
    createdAt: new Date().toISOString(),
  }),
}));

import { POST } from './route';

const SPLIT_ORIGINAL =
  "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home";

async function postRewrite(variantIndex: number) {
  const res = await POST(
    new Request('http://localhost/api/geo-audit/a1/suggest-rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        highlightLabel: 'Section: Split systems',
        content: SPLIT_ORIGINAL,
        heading: 'Split systems',
        dimension: 'aiReadability',
        fixHint: 'Use shorter sentences.',
        variantIndex,
      }),
    }),
    { params: Promise.resolve({ id: 'a1' }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { suggestedExample: string };
}

describe('POST suggest-rewrite variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns different text for variant 0 vs 1', async () => {
    const a = await postRewrite(0);
    const b = await postRewrite(1);
    expect(a.suggestedExample).not.toBe(b.suggestedExample);
    expect(a.suggestedExample.length).toBeGreaterThan(0);
  });
});
