import { describe, expect, it, vi, beforeEach } from 'vitest';

const getJob = vi.fn();
const cancel = vi.fn();

vi.mock('@shared/queue', () => ({
  queue: {
    getJob,
    cancel,
  },
}));

describe('POST /api/jobs/:id/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when job does not exist', async () => {
    getJob.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/jobs/missing/cancel', { method: 'POST' }), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels job and returns updated row', async () => {
    getJob
      .mockResolvedValueOnce({ id: 'job-1', status: 'running', progress: 40 })
      .mockResolvedValueOnce({ id: 'job-1', status: 'cancelled', progress: 40 });
    cancel.mockResolvedValue(undefined);

    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/api/jobs/job-1/cancel', { method: 'POST' }), {
      params: Promise.resolve({ id: 'job-1' }),
    });

    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith('job-1');
    const body = (await res.json()) as { job: { status: string } };
    expect(body.job.status).toBe('cancelled');
  });
});
