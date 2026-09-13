import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@shared/queue', () => ({
  queue: {
    enqueue: vi.fn().mockResolvedValue('job-test-123'),
  },
}));

vi.mock('@modules/geo-audit/server', () => ({
  listRecentAudits: vi.fn().mockResolvedValue([]),
  listRecentAuditSiteGroups: vi.fn().mockResolvedValue({ groups: [], totalSites: 0 }),
}));

describe('POST /api/geo-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 202 with jobId for valid url', async () => {
    const { POST } = await import('./route');
    const { queue } = await import('@shared/queue');

    const req = new Request('http://localhost/api/geo-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'example.com' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBe('job-test-123');
    expect(queue.enqueue).toHaveBeenCalledWith('geo-audit.run', expect.objectContaining({
      url: 'https://example.com',
    }), { idempotencyKey: undefined });
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/geo-audit', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
