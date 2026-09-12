/**
 * Perplexity Sonar provider — OpenAI-compatible chat API.
 *
 * Used for the perplexity simulation slot when PERPLEXITY_API_KEY is set.
 * Docs: https://docs.perplexity.ai/api-reference/chat-completions
 */

import { z } from 'zod';
import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { extractJsonBlock as extractJsonBlockFromModel } from '../json-parse';
import {
  AIProviderError,
  type AIProvider,
  type GenerateEmbeddingInput,
  type GenerateEmbeddingResult,
  type GenerateStructuredInput,
  type GenerateStructuredResult,
  type GenerateTextInput,
  type GenerateTextResult,
} from '../types';

interface PerplexityChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string };
}

const PERPLEXITY_API = 'https://api.perplexity.ai/chat/completions';

export class PerplexityProvider implements AIProvider {
  readonly name = 'perplexity';

  private headers(): Record<string, string> {
    if (!config.perplexity.apiKey) {
      throw new AIProviderError('PERPLEXITY_API_KEY not set', this.name);
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.perplexity.apiKey}`,
    };
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const model = input.model ?? config.perplexity.model;
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const t0 = Date.now();
    const res = await fetch(PERPLEXITY_API, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model,
        messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 2048,
      }),
    });

    const body = (await res.json()) as PerplexityChatResponse;
    if (!res.ok) {
      throw new AIProviderError(
        `Perplexity HTTP ${res.status}: ${body.error?.message ?? 'unknown'}`,
        this.name,
      );
    }

    const text = body.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new AIProviderError('Perplexity returned empty content', this.name);
    }

    aiLogger.debug({ provider: this.name, model, ms: Date.now() - t0 }, 'generateText ok');

    const inputTokens = body.usage?.prompt_tokens ?? Math.ceil(input.prompt.length / 4);
    const outputTokens = body.usage?.completion_tokens ?? Math.ceil(text.length / 4);
    return {
      text,
      model: body.model ?? model,
      provider: this.name,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: body.usage?.total_tokens ?? inputTokens + outputTokens,
      },
    };
  }

  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    const system =
      (input.system ?? '') +
      '\n\nYou MUST respond with valid JSON only matching the user schema. No prose, no markdown fences.';
    const result = await this.generateText({
      ...input,
      system,
      temperature: input.temperature ?? 0,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonBlockFromModel(result.text));
    } catch (err) {
      throw new AIProviderError('Failed to parse structured JSON from Perplexity', this.name, err);
    }
    const data = input.schema.parse(parsed);
    return { data, tokens: result.tokens, model: result.model, provider: result.provider };
  }

  async generateEmbedding(_input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    throw new AIProviderError('Perplexity does not expose embeddings', this.name);
  }
}
