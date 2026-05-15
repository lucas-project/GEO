import { api, pollJob } from '../api.mjs';
import { spinner, style, divider, heading } from '../ui.mjs';

export async function runSimulate(args) {
  if (!args.length) throw new Error('Prompt is required. Usage: geo simulate "<prompt>"');

  let targetBrand;
  const prompt = args
    .filter((a) => {
      if (a.startsWith('--brand=')) {
        targetBrand = a.slice('--brand='.length);
        return false;
      }
      return true;
    })
    .join(' ');

  const spin = spinner(`Running simulation across ChatGPT, Gemini, Claude, Perplexity…`);
  const { jobId } = await api.post('/api/simulate-ai-search', { prompt, targetBrand });

  const job = await pollJob(jobId, {
    onProgress: (j) => spin.update(`${j.status} · ${j.progress}%`),
  });
  if (job.status !== 'completed') {
    spin.stop(style.red(`✗ Simulation ${job.status}: ${job.error ?? 'unknown error'}`));
    process.exit(1);
  }
  const runId = job.result?.runId;
  spin.stop(style.green(`✓ Simulation complete (${runId})`));

  const { result } = await api.get(`/api/simulate-ai-search?runId=${runId}`);
  printResult(result);
}

function printResult(result) {
  console.log(heading('AI Search Simulation'));
  console.log(style.gray('Prompt:  ') + result.prompt);
  console.log(style.gray('Runs:    ') + result.runs.length);

  console.log(heading('Brand leaderboard'));
  if (result.aggregate.brandLeaderboard.length === 0) {
    console.log('  ' + style.gray('No brand mentions detected.'));
  } else {
    result.aggregate.brandLeaderboard.slice(0, 10).forEach((b, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${style.bold(b.brand.padEnd(28))} ${style.cyan(b.count + '×')}`);
    });
  }

  if (result.aggregate.domainLeaderboard.length > 0) {
    console.log(heading('Cited domains'));
    result.aggregate.domainLeaderboard.slice(0, 10).forEach((d, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${style.bold(d.domain.padEnd(32))} ${style.cyan(d.count + '×')}`);
    });
  }

  if (result.aggregate.targetVisibility) {
    console.log(heading('Target visibility'));
    const tv = result.aggregate.targetVisibility;
    console.log(`  Brand:        ${style.bold(tv.brand)}`);
    console.log(`  Visibility:   ${style.bold(tv.visibilityScore + '/100')}`);
    console.log(`  Platforms:    ${tv.mentionedOnPlatforms.join(', ') || style.gray('none')}`);
  }

  console.log();
  console.log(divider());
}
