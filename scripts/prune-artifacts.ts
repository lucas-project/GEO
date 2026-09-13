/** Preview or apply local retention. The default is a dry run; pass --apply to mutate data. */
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prisma } from '../src/shared/database/client';

const apply = process.argv.includes('--apply');
const screenshotDays = Number(process.env.GEO_SCREENSHOT_RETENTION_DAYS ?? 30);
const jobDays = Number(process.env.GEO_COMPLETED_JOB_RETENTION_DAYS ?? 14);
const screenshotCutoff = Date.now() - Math.max(1, screenshotDays) * 86_400_000;
const jobCutoff = new Date(Date.now() - Math.max(1, jobDays) * 86_400_000);
const screenshotRoot = resolve(process.cwd(), 'public/screenshots');

async function oldFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await oldFiles(file)));
    else if (entry.isFile() && (await stat(file)).mtimeMs < screenshotCutoff) found.push(file);
  }
  return found;
}

try {
  const screenshots = await oldFiles(screenshotRoot);
  const terminalJobs = await prisma.job.count({
    where: { status: { in: ['completed', 'failed', 'cancelled'] }, finishedAt: { lt: jobCutoff } },
  });
  console.log(`${apply ? 'Applying' : 'Dry run'}: ${screenshots.length} screenshots older than ${screenshotDays} days; ${terminalJobs} terminal jobs older than ${jobDays} days.`);
  for (const screenshot of screenshots) console.log(screenshot);
  if (!apply) {
    console.log('No data changed. Run npm run maintenance:prune -- --apply to apply this retention policy.');
  } else {
    await Promise.all(screenshots.map((file) => rm(file, { force: true })));
    const deleted = await prisma.job.deleteMany({
      where: { status: { in: ['completed', 'failed', 'cancelled'] }, finishedAt: { lt: jobCutoff } },
    });
    console.log(`Deleted ${screenshots.length} screenshots and ${deleted.count} terminal jobs.`);
  }
} finally {
  await prisma.$disconnect();
}
