import { config } from '@shared/config';

const SIMULATION_PLATFORMS = ['chatgpt', 'gemini', 'claude', 'perplexity'] as const;
type SimulatedPlatform = (typeof SIMULATION_PLATFORMS)[number];

export interface OllamaHealthResult {
  enabled: boolean;
  reachable: boolean;
  baseUrl: string;
  installedModels: string[];
  requiredModels: Record<SimulatedPlatform, string>;
  missingModels: string[];
  ready: boolean;
}

function modelInstalled(installed: string[], wanted: string): boolean {
  const w = wanted.toLowerCase();
  return installed.some((m) => {
    const name = m.toLowerCase();
    return name === w || name.startsWith(`${w}:`) || name.startsWith(`${w}-`);
  });
}

/** Ping Ollama and verify simulation models are pulled. */
export async function checkOllamaSimulationHealth(): Promise<OllamaHealthResult> {
  const enabled = config.simulation.aiProvider === 'ollama';
  const baseUrl = config.ollama.baseUrl.replace(/\/$/, '');
  const requiredModels = config.simulation.ollamaModels;

  let installedModels: string[] = [];
  let reachable = false;

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      reachable = true;
      const body = (await res.json()) as { models?: Array<{ name?: string }> };
      installedModels = (body.models ?? [])
        .map((m) => m.name?.trim())
        .filter((n): n is string => Boolean(n));
    }
  } catch {
    reachable = false;
  }

  const missingModels = enabled
    ? SIMULATION_PLATFORMS.filter((p) => !modelInstalled(installedModels, requiredModels[p])).map(
        (p) => requiredModels[p],
      )
    : [];

  return {
    enabled,
    reachable,
    baseUrl,
    installedModels,
    requiredModels,
    missingModels: [...new Set(missingModels)],
    ready: enabled && reachable && missingModels.length === 0,
  };
}

export function ollamaSetupSteps(health: OllamaHealthResult): string[] {
  if (!health.enabled) {
    return [
      'Set SIMULATION_AI_PROVIDER=ollama in .env',
      'Install Ollama from https://ollama.com/download',
      'Restart the app and worker',
    ];
  }
  const steps: string[] = [];
  if (!health.reachable) {
    steps.push('Install and start Ollama: https://ollama.com/download');
    steps.push(`Ensure Ollama is listening at ${health.baseUrl}`);
  }
  for (const model of health.missingModels) {
    steps.push(`Pull model: ollama pull ${model}`);
  }
  if (steps.length === 0) {
    steps.push('Ollama is ready — run a simulation or batch test.');
  }
  return steps;
}
