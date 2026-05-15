/**
 * Multi-provider — models "different AI search systems" by combining the
 * active real provider with platform-specific personas.
 *
 * When AI_PROVIDER=mock, each persona returns deterministic-but-distinct
 * output (so the Simulation UI feels real). When a real provider is
 * configured, each persona prepends a platform-specific system prompt.
 */

import { config } from '@shared/config';
import { ai } from './index';
import { buildMockSimulationResponse } from '@modules/ai-simulation';
import type { GenerateTextResult } from './types';

const isMockSimulationProvider = () => config.ai.provider === 'mock';

export type SimulatedPlatform = 'chatgpt' | 'gemini' | 'claude' | 'perplexity';

export const SIMULATED_PLATFORMS: readonly SimulatedPlatform[] = [
  'chatgpt',
  'gemini',
  'claude',
  'perplexity',
] as const;

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

export interface PlatformResponse {
  platform: SimulatedPlatform;
  text: string;
  model: string;
  provider: string;
  tokens: GenerateTextResult['tokens'];
}

export async function runOnAllPlatforms(input: {
  prompt: string;
  perPlatformRuns?: number;
  targetBrand?: string;
  targetUrl?: string;
}): Promise<PlatformResponse[]> {
  const runs = input.perPlatformRuns ?? 1;
  const results: PlatformResponse[] = [];

  for (const platform of SIMULATED_PLATFORMS) {
    for (let i = 0; i < runs; i++) {
      let text: string;
      let model: string;
      let provider: string;
      let tokens: GenerateTextResult['tokens'];

      if (isMockSimulationProvider()) {
        text = buildMockSimulationResponse({
          prompt: input.prompt,
          platform,
          targetBrand: input.targetBrand,
          targetUrl: input.targetUrl,
        });
        model = 'mock-simulation-v1';
        provider = 'mock';
        const inputTokens = Math.ceil(input.prompt.length / 4);
        const outputTokens = Math.ceil(text.length / 4);
        tokens = { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };
      } else {
        const res = await ai.generateText({
          prompt: input.prompt,
          system: PLATFORM_PERSONAS[platform],
          temperature: 0.3,
        });
        text = res.text;
        model = res.model;
        provider = res.provider;
        tokens = res.tokens;
      }

      results.push({ platform, text, model, provider, tokens });
    }
  }
  return results;
}
