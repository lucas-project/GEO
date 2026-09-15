import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueJob, getRequestOwnerId, getRequestSession, workspaceWriteRequired } = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  getRequestOwnerId: vi.fn(),
  getRequestSession: vi.fn(),
  workspaceWriteRequired: vi.fn(),
}));

vi.mock('@modules/geo-audit/server', () => ({
  findLatestCompletedAuditForUrl: vi.fn(),
  listRecentAuditSiteGroups: vi.fn(),
  listRecentAudits: vi.fn(),
}));

vi.mock('@/lib/api-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-route')>()),
  enqueueJob,
}));

vi.mock('@/lib/owner-scope', () => ({
  getRequestOwnerId,
  getRequestSession,
  workspaceWriteRequired,
  authenticationRequired: vi.fn(),
}));

import { GET, POST } from './route';

describe('POST /api/geo-audit URL admission', () => {
  beforeEach(() => {
    enqueueJob.mockReset();
    getRequestOwnerId.mockReturnValue('tenant-a');
    getRequestSession.mockResolvedValue({ userId: 'user-a', ownerId: 'tenant-a', role: 'owner' });
    workspaceWriteRequired.mockReturnValue(null);
  });

  it('rejects a private audit target before queuing work', async () => {
    const response = await POST(
      new Request('http://localhost/api/geo-audit', {
        method: 'POST',
        body: JSON.stringify({ url: 'http://192.168.1.10' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('rejects a private explicitly selected page before queuing work', async () => {
    const response = await POST(
      new Request('http://localhost/api/geo-audit', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://example.com',
          pageUrls: ['https://example.com/about', 'http://198.18.0.1/internal'],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('captures the request owner in a queued audit', async () => {
    await POST(
      new Request('http://localhost/api/geo-audit', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
    );

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.any(Request),
      'geo-audit.run',
      expect.objectContaining({ url: 'https://example.com', ownerId: 'tenant-a' }),
    );
  });

  it('lists audits only for the request owner', async () => {
    const { listRecentAudits } = await import('@modules/geo-audit/server');
    vi.mocked(listRecentAudits).mockResolvedValue([]);

    const response = await GET(new Request('http://localhost/api/geo-audit?limit=10'));

    expect(response.status).toBe(200);
    expect(listRecentAudits).toHaveBeenCalledWith(10, 'tenant-a');
  });
});
