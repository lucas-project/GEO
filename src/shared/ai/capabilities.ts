import { config } from '@shared/config';
import type { AIProvider } from './types';

export type RuntimeCapability = 'remote_ai' | 'remote_search' | 'embeddings' | 'simulation';

export type CapabilityUnavailableReason =
  | 'mode_disabled'
  | 'simulation_requires_ollama';

export interface CapabilityAvailability {
  capability: RuntimeCapability;
  available: boolean;
  reason?: CapabilityUnavailableReason;
  message?: string;
}

export class CapabilityUnavailableError extends Error {
  constructor(public readonly availability: CapabilityAvailability) {
    super(availability.message ?? `${availability.capability} is unavailable in this run mode.`);
    this.name = 'CapabilityUnavailableError';
  }
}

function runtimeMode() {
  return config.runtime?.mode ?? (config.ai.provider === 'mock' ? 'free-deterministic' : 'paid-assisted');
}

/** One product-facing source of truth for capability availability and explanation. */
export function getCapabilityAvailability(capability: RuntimeCapability): CapabilityAvailability {
  const mode = runtimeMode();
  if (mode === 'free-deterministic') {
    return {
      capability,
      available: false,
      reason: 'mode_disabled',
      message: 'AI simulation and model-assisted features are disabled in free deterministic mode.',
    };
  }
  if (mode === 'demo') {
    return capability === 'simulation'
      ? { capability, available: true }
      : {
          capability,
          available: false,
          reason: 'mode_disabled',
          message: 'Only deterministic simulation is available in demo mode.',
        };
  }
  if (mode === 'local-assisted') {
    return capability === 'simulation' && config.simulation.aiProvider === 'ollama'
      ? { capability, available: true }
      : {
          capability,
          available: false,
          reason: capability === 'simulation' ? 'simulation_requires_ollama' : 'mode_disabled',
          message:
            capability === 'simulation'
              ? 'Simulation in local-assisted mode requires SIMULATION_AI_PROVIDER=ollama.'
              : 'This model-assisted feature is disabled in local-assisted mode.',
        };
  }
  return { capability, available: true };
}

/** Capability gate used by product modules to keep the free tier zero-cost by default. */
export function allowsCapability(capability: RuntimeCapability): boolean {
  return getCapabilityAvailability(capability).available;
}

/** Throw a structured error before a provider, cache, or telemetry call is reached. */
export function assertCapabilityAvailable(capability: RuntimeCapability): void {
  const availability = getCapabilityAvailability(capability);
  if (!availability.available) throw new CapabilityUnavailableError(availability);
}

/** Wrap override providers too, so feature-specific provider configuration cannot bypass the mode gate. */
export function capabilityBoundProvider(provider: AIProvider, capability: RuntimeCapability): AIProvider {
  return {
    name: provider.name,
    generateText: async (input) => {
      assertCapabilityAvailable(capability);
      return provider.generateText(input);
    },
    generateStructuredOutput: async (input) => {
      assertCapabilityAvailable(capability);
      return provider.generateStructuredOutput(input);
    },
    generateEmbedding: async (input) => {
      assertCapabilityAvailable(capability);
      return provider.generateEmbedding(input);
    },
  };
}

export function isFreeDeterministicMode(): boolean {
  return runtimeMode() === 'free-deterministic';
}
