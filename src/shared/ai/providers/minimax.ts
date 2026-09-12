/**
 * MiniMax provider — OpenAI-compatible chat API.
 *
 * Set AI_PROVIDER=minimax (or SITE_KEYWORDS_AI_PROVIDER=minimax) + MINIMAX_API_KEY.
 * Docs: https://platform.minimax.io/docs/api-reference/text-chat-openai
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

interface MinimaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  base_resp?: { status_code?: number; status_msg?: string };
}

export class MinimaxProvider implements AIProvider {
  readonly name = 'minimax';

  private baseUrl(): string {
    return config.minimax.baseUrl.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    if (!config.minimax.apiKey) {
      throw new AIProviderError('MINIMAX_API_KEY not set', this.name);
    }
    const key = config.minimax.apiKey;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'MiniMax-API-Key': key,
    };
  }

  private assertApiOk(body: MinimaxChatResponse, httpStatus: number): void {
    const code = body.base_resp?.status_code;
    if (code != null && code !== 0) {
      throw new AIProviderError(
        `MiniMax API error ${code}: ${body.base_resp?.status_msg ?? 'unknown'}`,
        this.name,
      );
    }
    if (httpStatus >= 400) {
      const errBody = body as MinimaxChatResponse & {
        error?: { message?: string; type?: string };
      };
      const hint =
        body.base_resp?.status_msg ??
        errBody.error?.message ??
        (httpStatus === 401
          ? 'invalid API key or wrong region — CN keys (sk-cp-) need MINIMAX_BASE_URL=https://api.minimaxi.com/v1; global keys use https://api.minimax.io/v1. Do not wrap MINIMAX_API_KEY in quotes.'
          : 'unknown');
      throw new AIProviderError(`MiniMax HTTP ${httpStatus}: ${hint}`, this.name);
    }
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const model = input.model ?? config.minimax.model;
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const t0 = Date.now();
    const res = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model,
        messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 2048,
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const body = (await res.json()) as MinimaxChatResponse;
    this.assertApiOk(body, res.status);

    const text = body.choices?.[0]?.message?.content ?? '';
    aiLogger.info({ provider: this.name, model, latencyMs: Date.now() - t0 }, 'generateText');

    return {
      text,
      tokens: {
        input: body.usage?.prompt_tokens ?? 0,
        output: body.usage?.completion_tokens ?? 0,
        total: body.usage?.total_tokens ?? 0,
      },
      model,
      provider: this.name,
    };
  }

  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    const model = input.model ?? config.minimax.model;
    let lastErr = '';
    let totalTokens = { input: 0, output: 0, total: 0 };

    for (let attempt = 0; attempt < 3; attempt++) {
      const repair =
        attempt === 0
          ? ''
          : `\n\nYour previous answer failed validation: ${lastErr}\nReturn ONLY corrected valid JSON with no markdown fences.`;
      const system =
        (input.system ?? '') +
        '\n\nYou MUST respond with valid JSON only matching the user schema. No prose, no markdown fences.' +
        repair;

      const result = await this.generateText({
        ...input,
        system,
        model,
        temperature: attempt === 0 ? (input.temperature ?? 0) : 0,
      });
      totalTokens = result.tokens;

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonBlockFromModel(result.text));
      } catch (e) {
        lastErr = `JSON parse: ${(e as Error).message}`;
        continue;
      }

      const validated = input.schema.safeParse(parsed);
      if (validated.success) {
        return {
          data: validated.data,
          tokens: totalTokens,
          model: result.model,
          provider: this.name,
        };
      }
      lastErr = validated.error.message;
    }

    throw new AIProviderError(
      `MiniMax structured output failed after retries: ${lastErr}`,
      this.name,
    );
  }

  async generateEmbedding(_input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    throw new AIProviderError(
      'MiniMax embeddings are not configured; use AI_PROVIDER=ollama for embeddings or set a dedicated embed provider.',
      this.name,
    );
  }
}
