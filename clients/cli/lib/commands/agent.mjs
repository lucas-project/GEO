import { api } from '../api.mjs';
import { spinner, style, divider, heading } from '../ui.mjs';

export async function runAgent(goal) {
  if (!goal) throw new Error('Goal is required. Usage: geo agent "<goal>"');

  const spin = spinner(`Planning…`);
  const planResp = await api.post('/api/agent/plan', { goal });
  spin.stop(style.green(`✓ Plan created (${planResp.planId})`));

  console.log(heading('Plan'));
  console.log(style.gray(planResp.plan.summary));
  console.log();
  planResp.plan.steps.forEach((step, i) => {
    console.log(`  ${style.cyan(String(i + 1).padStart(2))}. ${style.bold(step.type)}`);
    console.log('      ' + style.gray(step.reason));
  });
  console.log();

  const runSpin = spinner('Executing…');
  await api.post('/api/agent/run', { planId: planResp.planId });

  let lastSummary = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60 * 1000) {
    const { plan } = await api.get(`/api/agent/plan/${planResp.planId}`);
    const summary = plan.results
      .map((r, i) => `${i + 1}:${r.status[0]}`)
      .join(' ');
    if (summary !== lastSummary) {
      runSpin.update('progress ' + summary);
      lastSummary = summary;
    }
    if (plan.status === 'completed' || plan.status === 'failed') {
      runSpin.stop(plan.status === 'completed' ? style.green('✓ Plan complete') : style.red('✗ Plan failed'));
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log();
  console.log(style.gray(`View at: `) + style.cyan(`${process.env.GEO_API_URL ?? 'http://localhost:3000'}/agent/${planResp.planId}`));
  console.log();
  console.log(divider());
}
