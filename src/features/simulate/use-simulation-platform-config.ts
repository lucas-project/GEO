'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Platform } from '@modules/ai-simulation';

export type SimulationPlatformMode = 'mock' | 'live' | 'local' | 'persona';

export interface SimulationPlatformConfigEntry {
  platform: Platform;
  label: string;
  mode: SimulationPlatformMode;
  model: string;
  fallbackProvider: string;
}

export interface SimulationConfigResponse {
  defaultProvider: string;
  configuredSimulationProvider: string;
  simulationProvider: string;
  localMultiModel: boolean;
  availability: {
    available: boolean;
    reason?: string;
    message?: string;
  };
  platforms: SimulationPlatformConfigEntry[];
  ollama?: {
    enabled: boolean;
    reachable: boolean;
    ready: boolean;
    missingModels: string[];
    setupSteps: string[];
  };
}

export function platformLabelsFromConfig(
  config: SimulationConfigResponse | undefined,
): Record<Platform, string> {
  const out = {} as Record<Platform, string>;
  for (const p of config?.platforms ?? []) {
    out[p.platform] = p.label;
  }
  return out;
}

const FALLBACK: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

export function resolvePlatformLabel(
  platform: Platform,
  labels: Record<Platform, string> | undefined,
  run?: { provider?: string; model?: string },
): string {
  if (run?.provider === 'ollama' && run.model) return run.model;
  return labels?.[platform] ?? FALLBACK[platform];
}

export function useSimulationPlatformConfig() {
  return useQuery<SimulationConfigResponse>({
    queryKey: ['sim-platform-config'],
    queryFn: () => api.get('/api/simulate-ai-search/config'),
    staleTime: 60_000,
  });
}
