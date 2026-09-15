import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getRequestOwnerId } = vi.hoisted(() => ({ getRequestOwnerId: vi.fn() }));

vi.mock('@modules/geo-audit/server', () => ({
  getAudit: vi.fn(),
}));

vi.mock('@/lib/owner-scope', () => ({ getRequestOwnerId }));

describe('GET /api/geo-audit/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestOwnerId.mockReturnValue('tenant-a');
  });

  it('returns audit.status from getAudit', async () => {
    const { getAudit } = await import('@modules/geo-audit/server');
    vi.mocked(getAudit).mockResolvedValue({
      id: 'audit-1',
      siteId: 'site-1',
      url: 'https://example.com',
      overallScore: 25,
      dimensions: {} as never,
      narrative: null,
      topIssues: [],
      topFixes: [],
      screenshotUrl: null,
      status: 'partial',
      scoringMeta: {
        completion: 'partial',
        stopReason: 'httpRequests',
        auditedPages: 4,
        requestedPages: 5,
        sampleCoverageStatus: 'partial',
      } as never,
      createdAt: new Date().toISOString(),
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/geo-audit/audit-1'), {
      params: Promise.resolve({ id: 'audit-1' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { audit: { status?: string; scoringMeta?: { completion?: string } } };
    expect(body.audit.status).toBe('partial');
    expect(body.audit.scoringMeta?.completion).toBe('partial');
    expect(getAudit).toHaveBeenCalledWith('audit-1', 'tenant-a');
  });

  it('returns 404 when audit is missing', async () => {
    const { getAudit } = await import('@modules/geo-audit/server');
    vi.mocked(getAudit).mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/geo-audit/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });
});
