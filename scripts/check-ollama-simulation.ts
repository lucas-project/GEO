#!/usr/bin/env npx tsx
/**
 * Check Ollama connectivity and simulation models.
 * Usage: npm run ollama:check
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { checkOllamaSimulationHealth, ollamaSetupSteps } = await import(
    '../src/shared/ai/ollama-health'
  );

  const health = await checkOllamaSimulationHealth();
  console.log('\nOllama simulation check\n');
  console.log(
    `  Simulation provider: ${health.enabled ? 'ollama' : '(not ollama — set SIMULATION_AI_PROVIDER=ollama)'}`,
  );
  console.log(`  Base URL:            ${health.baseUrl}`);
  console.log(`  Reachable:           ${health.reachable ? 'yes' : 'no'}`);
  console.log(`  Ready:               ${health.ready ? 'yes' : 'no'}`);

  if (health.installedModels.length > 0) {
    console.log(`\n  Installed models (${health.installedModels.length}):`);
    for (const m of health.installedModels.slice(0, 12)) {
      console.log(`    - ${m}`);
    }
    if (health.installedModels.length > 12) {
      console.log(`    … and ${health.installedModels.length - 12} more`);
    }
  }

  console.log('\n  Required per platform slot:');
  for (const [platform, model] of Object.entries(health.requiredModels)) {
    const ok = !health.missingModels.includes(model);
    console.log(`    ${platform.padEnd(12)} ${model}${ok ? '' : '  ← missing'}`);
  }

  console.log('\n  Next steps:');
  for (const step of ollamaSetupSteps(health)) {
    console.log(`    • ${step}`);
  }
  console.log('');
  process.exit(health.ready || !health.enabled ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
