/**
 * Multi-provider — models "different AI search systems" by combining the
 * active real provider with platform-specific personas.
 *
 * Modes per platform slot:
 * - **live** — dedicated cloud API key (OpenAI, Google, Anthropic, Perplexity)
 * - **local** — distinct Ollama models per slot (no API keys; SIMULATION_AI_PROVIDER=ollama)
 * - **persona** — one shared provider with platform-specific system prompts
 * - **mock** — deterministic canned answers (AI_PROVIDER=mock, no keys)
 */

import { config } from '@shared/config';
import { meteredProvider } from './usage';
import { ai } from './index';
import { assertCapabilityAvailable } from './capabilities';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { OllamaProvider } from './providers/ollama';
import { OpenAIProvider } from './providers/openai';
import { PerplexityProvider } from './providers/perplexity';
import { buildMockSimulationResponse } from '@modules/ai-simulation';
import type { AIProvider } from './types';
import type { GenerateTextResult } from './types';

const isMockSimulationProvider = () => config.simulation.aiProvider === 'mock';

export type SimulatedPlatform = 'chatgpt' | 'gemini' | 'claude' | 'perplexity';

export const SIMULATED_PLATFORMS: readonly SimulatedPlatform[] = [
  'chatgpt',
  'gemini',
  'claude',
  'perplexity',
] as const;

export type SimulationPlatformMode = 'mock' | 'live' | 'local' | 'persona';

const PLATFORM_PERSONAS: Record<SimulatedPlatform, string> = {
  chatgpt:
    'You are an answer-engine modeled after ChatGPT search. Provide concise, structured answers with inline citations to authoritative sources. Prefer recent, high-authority pages.',
  gemini:
    'You are an answer-engine modeled after Google Gemini AI Overview. Provide a brief synthesis citing well-known publishers and Wikipedia where applicable.',
  claude:
    'You are an answer-engine modeled after Claude with web tool. Provide thoughtful, nuanced answers with explicit source attribution; prefer reasoning over raw lists.',
  perplexity:
    'You are an answer-engine modeled after Perplexity. Respond in a numbered list of sources [1] [2] [3] with a short synthesis and explicit source URLs after.',
};

const PLATFORM_LABELS: Record<SimulatedPlatform, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

function hasLiveKeyForPlatform(platform: SimulatedPlatform): boolean {
  switch (platform) {
    case 'chatgpt':
      return Boolean(config.ai.openai.apiKey || config.ai.openai.baseUrl);
    case 'gemini':
      return Boolean(config.ai.gemini.apiKey);
    case 'claude':
      return Boolean(config.ai.anthropic.apiKey);
    case 'perplexity':
      return Boolean(config.perplexity.apiKey);
  }
}

function usesOllamaForSimulation(): boolean {
  return config.simulation.aiProvider === 'ollama';
}

function ollamaModelForPlatform(
  platform: SimulatedPlatform,
  singleModel?: boolean,
): string {
  if (singleModel) {
    return config.simulation.ollamaModels.chatgpt || config.ollama.model;
  }
  return config.simulation.ollamaModels[platform] || config.ollama.model;
}

function providerForPlatform(platform: SimulatedPlatform): AIProvider {
  if (usesOllamaForSimulation()) {
    return new OllamaProvider();
  }

  switch (platform) {
    case 'chatgpt':
      if (config.ai.openai.apiKey || config.ai.openai.baseUrl) return new OpenAIProvider();
      break;
    case 'gemini':
      if (config.ai.gemini.apiKey) return new GeminiProvider();
      break;
    case 'claude':
      if (config.ai.anthropic.apiKey) return new AnthropicProvider();
      break;
    case 'perplexity':
      if (config.perplexity.apiKey) return new PerplexityProvider();
      break;
  }
  return ai;
}

function expectedModelForPlatform(platform: SimulatedPlatform): string {
  if (usesOllamaForSimulation()) {
    return ollamaModelForPlatform(platform);
  }
  switch (platform) {
    case 'chatgpt':
      return config.ai.openai.model;
    case 'gemini':
      return config.ai.gemini.model;
    case 'claude':
      return config.ai.anthropic.model;
    case 'perplexity':
      return config.perplexity.model;
  }
}

export function getSimulationPlatformMode(platform: SimulatedPlatform): SimulationPlatformMode {
  if (usesOllamaForSimulation()) return 'local';
  if (isMockSimulationProvider() && !hasLiveKeyForPlatform(platform)) return 'mock';
  if (hasLiveKeyForPlatform(platform)) return 'live';
  return 'persona';
}

export interface SimulationPlatformConfigEntry {
  platform: SimulatedPlatform;
  /** Primary UI label — model id when local, product name when live/persona. */
  label: string;
  mode: SimulationPlatformMode;
  model: string;
  fallbackProvider: string;
}

export function simulationPlatformDisplayLabel(
  platform: SimulatedPlatform,
  mode: SimulationPlatformMode,
  model: string,
): string {
  return mode === 'local' ? model : PLATFORM_LABELS[platform];
}

export function getSimulationPlatformConfig(): {
  defaultProvider: string;
  configuredSimulationProvider: string;
  simulationProvider: string;
  localMultiModel: boolean;
  platforms: SimulationPlatformConfigEntry[];
} {
  const localMultiModel = usesOllamaForSimulation();
  return {
    defaultProvider: config.ai.provider,
    configuredSimulationProvider: config.simulation.configuredAiProvider,
    simulationProvider: config.simulation.aiProvider,
    localMultiModel,
    platforms: SIMULATED_PLATFORMS.map((platform) => {
      const mode = getSimulationPlatformMode(platform);
      const model = expectedModelForPlatform(platform);
      return {
        platform,
        label: simulationPlatformDisplayLabel(platform, mode, model),
        mode,
        model,
        fallbackProvider: config.simulation.aiProvider,
      };
    }),
  };
}

export interface PlatformResponse {
  platform: SimulatedPlatform;
  text: string;
  model: string;
  provider: string;
  mode: SimulationPlatformMode;
  tokens: GenerateTextResult['tokens'];
}

export interface PlatformRunOptions {
  /** Batch fast path: one Ollama model for every platform slot. */
  singleModel?: boolean;
  maxTokens?: number;
}

export async function runOnAllPlatforms(input: {
  prompt: string;
  perPlatformRuns?: number;
  targetBrand?: string;
  targetUrl?: string;
  runOptions?: PlatformRunOptions;
}): Promise<PlatformResponse[]> {
  assertCapabilityAvailable('simulation');
  const runs = input.perPlatformRuns ?? 1;
  const runOptions = input.runOptions;
  const tasks: Array<() => Promise<PlatformResponse>> = [];

  for (const platform of SIMULATED_PLATFORMS) {
    for (let i = 0; i < runs; i++) {
      tasks.push(() => runOnPlatform(input, platform, runOptions));
    }
  }

  if (usesOllamaForSimulation()) {
    if (runOptions?.singleModel) {
      return Promise.all(tasks.map((task) => task()));
    }
    const results: PlatformResponse[] = [];
    for (const task of tasks) {
      results.push(await task());
    }
    return results;
  }

  return Promise.all(tasks.map((task) => task()));
}

async function runOnPlatform(
  input: {
    prompt: string;
    targetBrand?: string;
    targetUrl?: string;
  },
  platform: SimulatedPlatform,
  runOptions?: PlatformRunOptions,
): Promise<PlatformResponse> {
  if (isMockSimulationProvider() && !usesOllamaForSimulation() && !hasLiveKeyForPlatform(platform)) {
    const text = buildMockSimulationResponse({
      prompt: input.prompt,
      platform,
      targetBrand: input.targetBrand,
      targetUrl: input.targetUrl,
    });
    const inputTokens = Math.ceil(input.prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    return {
      platform,
      text,
      model: 'mock-simulation-v1',
      provider: 'mock',
      mode: 'mock',
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
    };
  }

  const platformAi = meteredProvider(providerForPlatform(platform));
  const singleModel = runOptions?.singleModel ?? false;
  const modelOverride = usesOllamaForSimulation()
    ? ollamaModelForPlatform(platform, singleModel)
    : undefined;
  const maxTokens = runOptions?.maxTokens ?? config.simulation.maxTokens;
  const res = await platformAi.generateText({
    prompt: input.prompt,
    system: PLATFORM_PERSONAS[platform],
    model: modelOverride,
    temperature: 0.3,
    maxTokens,
    keepAlive: usesOllamaForSimulation() ? config.simulation.ollamaKeepAlive : undefined,
  });
  return {
    platform,
    text: res.text,
    model: res.model,
    provider: res.provider,
    mode: getSimulationPlatformMode(platform),
    tokens: res.tokens,
  };
}
