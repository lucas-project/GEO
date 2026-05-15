import { api, pollJob } from '../api.mjs';
import { spinner, style, divider, heading } from '../ui.mjs';

export async function runCompare(args) {
  if (args.length < 2) {
    throw new Error('Usage: geo compare <target> <competitor1> [competitor2 ...]');
  }
  const [targetUrl, ...competitorUrls] = args;
  const spin = spinner(`Auditing ${1 + competitorUrls.length} sites…`);
  const { jobId } = await api.post('/api/competitor-analysis', { targetUrl, competitorUrls });
  const job = await pollJob(jobId, {
    onProgress: (j) => spin.update(`${j.status} · ${j.progress}%`),
  });
  if (job.status !== 'completed') {
    spin.stop(style.red(`✗ Comparison ${job.status}: ${job.error ?? 'unknown error'}`));
    process.exit(1);
  }
  spin.stop(style.green('✓ Comparison complete'));

  console.log(heading('Competitor Comparison'));
  console.log(style.gray('Target:      ') + targetUrl);
  console.log(style.gray('Competitors: ') + competitorUrls.join(', '));
  console.log();
  console.log(style.gray('View detailed comparison at: ') + style.cyan(`${process.env.GEO_API_URL ?? 'http://localhost:3000'}/competitors`));
  console.log();
  console.log(divider());
}
