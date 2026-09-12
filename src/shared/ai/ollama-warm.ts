import { config } from '@shared/config';
import { logger } from '@shared/logger';

const warmLogger = logger.child({ module: 'ollama-warm' });

let lastWarmAt = 0;
let lastWarmKey = '';

export interface WarmOllamaOptions {
  /** Subset of models to load; defaults to all simulation slots. */
  modelIds?: string[];
}

function warmModelSet(): string[] {
  if (config.simulation.aiProvider !== 'ollama') return [];
  if (config.simulation.batchSingleModel) {
    const primary =
      config.simulation.ollamaModels.chatgpt || config.ollama.model;
    return [primary];
  }
  return [...new Set(Object.values(config.simulation.ollamaModels))];
}

/** Load simulation model(s) into Ollama memory before a batch (cached to avoid fixed overhead every run). */
export async function warmOllamaSimulationModels(
  options?: WarmOllamaOptions,
): Promise<void> {
  if (config.simulation.aiProvider !== 'ollama') return;

  const models = options?.modelIds?.length
    ? [...new Set(options.modelIds)]
    : warmModelSet();
  if (models.length === 0) return;

  const cacheMs = config.simulation.warmCacheMinutes * 60_000;
  const key = models.slice().sort().join('|');
  if (key === lastWarmKey && Date.now() - lastWarmAt < cacheMs) {
    warmLogger.debug({ models }, 'ollama warm skipped (recent cache hit)');
    return;
  }

  const base = config.ollama.baseUrl.replace(/\/$/, '');
  const keepAlive = config.simulation.ollamaKeepAlive;

  warmLogger.info({ models, count: models.length }, 'ollama warm starting');

  // Sequential warm avoids loading multiple large weights at once on CPU/low-VRAM machines.
  for (const model of models) {
    try {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: ' ',
          stream: false,
          keep_alive: keepAlive,
          options: { num_predict: 1, temperature: 0 },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        warmLogger.warn({ model, status: res.status }, 'ollama warm failed');
      }
    } catch (err) {
      warmLogger.warn({ model, err: (err as Error).message }, 'ollama warm skipped');
    }
  }

  lastWarmAt = Date.now();
  lastWarmKey = key;
  warmLogger.info({ models }, 'ollama warm complete');
}

/** @internal test helper */
export function resetOllamaWarmCache(): void {
  lastWarmAt = 0;
  lastWarmKey = '';
}
