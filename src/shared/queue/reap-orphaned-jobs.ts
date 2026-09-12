import { prisma } from '@shared/database/client';
import { queueLogger } from '@shared/logger';

const INTERRUPTED_ERROR = 'Interrupted — worker stopped or restarted';

/** Fail jobs left in `running` when a worker process starts (orphaned after Ctrl+C / crash). */
export async function reapOrphanedRunningJobs(): Promise<number> {
  const result = await prisma.job.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      error: INTERRUPTED_ERROR,
      finishedAt: new Date(),
    },
  });
  if (result.count > 0) {
    queueLogger.info({ count: result.count }, 'reaped orphaned running jobs');
  }
  return result.count;
}

export { INTERRUPTED_ERROR };
