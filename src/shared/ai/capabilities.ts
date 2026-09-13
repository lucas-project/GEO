import { config } from '@shared/config';

export type RuntimeCapability = 'remote_ai' | 'remote_search' | 'embeddings' | 'simulation';

/** Capability gate used by product modules to keep the free tier zero-cost by default. */
export function allowsCapability(capability: RuntimeCapability): boolean {
  const mode = config.runtime?.mode ?? (config.ai.provider === 'mock' ? 'free-deterministic' : 'paid-assisted');
  if (mode === 'demo') return capability === 'simulation';
  if (mode === 'free-deterministic') return false;
  if (mode === 'local-assisted') {
    return capability === 'simulation' ? config.simulation.aiProvider === 'ollama' : false;
  }
  return true;
}

export function isFreeDeterministicMode(): boolean {
  return (config.runtime?.mode ?? (config.ai.provider === 'mock' ? 'free-deterministic' : 'paid-assisted')) === 'free-deterministic';
}
