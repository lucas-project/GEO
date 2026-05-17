import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@modules/geo-audit/server', () => ({
  getAudit: vi.fn().mockResolvedValue({
    id: 'a1',
    url: 'https://example.com',
    overallScore: 50,
    dimensions: {},
    narrative: '',
    topIssues: [],
    topFixes: [],
    createdAt: new Date().toISOString(),
  }),
}));

vi.mock('@modules/optimization/generators/answer-first', () => ({
  generateAnswerFirst: vi.fn().mockResolvedValue({
    rewritten: 'Our products deliver reliable performance in extreme climates.',
    rationale: 'test',
  }),
}));

import { POST } from './route';

describe('POST /api/geo-audit/[id]/suggest-rewrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns suggested rewrite for answer extraction', async () => {
    const res = await POST(
      new Request('http://localhost/api/geo-audit/a1/suggest-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          highlightLabel: 'Section: Reliable and quality',
          content: 'Designed and built for extreme conditions.',
          heading: 'Reliable and quality',
          dimension: 'answerExtraction',
        }),
      }),
      { params: Promise.resolve({ id: 'a1' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestedExample).toContain('reliable');
  });
});
