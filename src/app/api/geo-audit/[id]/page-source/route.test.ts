import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@modules/geo-audit/server', () => ({
  getAuditPageSource: vi.fn(),
}));

import { getAuditPageSource } from '@modules/geo-audit/server';
import { GET } from './route';

describe('GET /api/geo-audit/[id]/page-source', () => {
  beforeEach(() => {
    vi.mocked(getAuditPageSource).mockReset();
  });

  it('returns 400 when url is missing', async () => {
    const res = await GET(new Request('http://localhost/api/geo-audit/a1/page-source'), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when page source not found', async () => {
    vi.mocked(getAuditPageSource).mockResolvedValue(null);
    const res = await GET(
      new Request('http://localhost/api/geo-audit/a1/page-source?url=https://example.com'),
      { params: Promise.resolve({ id: 'a1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns page source payload', async () => {
    vi.mocked(getAuditPageSource).mockResolvedValue({
      url: 'https://example.com',
      statusCode: 200,
      html: '<html></html>',
      offset: 0,
      truncated: false,
      error: null,
    });
    const res = await GET(
      new Request('http://localhost/api/geo-audit/a1/page-source?url=https://example.com'),
      { params: Promise.resolve({ id: 'a1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.html).toContain('html');
  });
});
