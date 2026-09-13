import { describe, expect, it, vi, beforeEach } from 'vitest';

const updateMany = vi.fn();

vi.mock('@shared/database/client', () => ({
  prisma: {
    job: {
      updateMany,
    },
  },
}));

describe('reapOrphanedRunningJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all running jobs as failed with interrupted message', async () => {
    updateMany.mockResolvedValue({ count: 2 });
    const { reapOrphanedRunningJobs, INTERRUPTED_ERROR } = await import('./reap-orphaned-jobs');

    const count = await reapOrphanedRunningJobs();

    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { status: 'running', OR: [{ leaseExpiresAt: { lt: expect.any(Date) } }, { leaseExpiresAt: null }] },
      data: {
        status: 'failed',
        error: INTERRUPTED_ERROR,
        finishedAt: expect.any(Date),
      },
    });
  });

  it('returns zero when no running jobs', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { reapOrphanedRunningJobs } = await import('./reap-orphaned-jobs');

    expect(await reapOrphanedRunningJobs()).toBe(0);
  });
});
