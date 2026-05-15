/**
 * Anthropic provider — optional, lazy-loaded.
 *
 * To enable: install `@anthropic-ai/sdk` and set AI_PROVIDER=anthropic + ANTHROPIC_API_KEY.
 */

import { z } from 'zod';
import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
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

// Types are intentionally `any` here: @anthropic-ai/sdk is an optional
// dependency and may not be installed at compile-time. The runtime import
// below verifies presence and surfaces a friendly error otherwise.
type AnthropicClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private clientPromise: Promise<AnthropicClient> | null = null;

  private async client(): Promise<AnthropicClient> {
    if (!config.ai.anthropic.apiKey) {
      throw new AIProviderError('ANTHROPIC_API_KEY not set', this.name);
    }
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        try {
          // @ts-expect-error optional peer dependency, resolved at runtime
          const mod = await import('@anthropic-ai/sdk');
          const Ctor = (mod.default ?? mod) as new (opts: { apiKey: string }) => AnthropicClient;
          return new Ctor({ apiKey: config.ai.anthropic.apiKey });
        } catch (err) {
          throw new AIProviderError(
            '@anthropic-ai/sdk not installed; run `npm install @anthropic-ai/sdk`',
            this.name,
            err,
          );
        }
      })();
    }
    return this.clientPromise;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const anthropic = await this.client();
    const model = input.model ?? config.ai.anthropic.model;
    const t0 = Date.now();
    const msg = await anthropic.messages.create({
      model,
      max_tokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.2,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    });
    aiLogger.info({ provider: this.name, model, latencyMs: Date.now() - t0 }, 'generateText');

    const block = msg.content.find((b: { type: string; text?: string }) => b.type === 'text');
    const text = block && 'text' in block ? (block.text as string) : '';
    return {
      text,
      tokens: {
        input: msg.usage.input_tokens,
        output: msg.usage.output_tokens,
        total: msg.usage.input_tokens + msg.usage.output_tokens,
      },
      model,
      provider: this.name,
    };
  }

  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    const system =
      (input.system ?? '') +
      '\n\nYou MUST respond with valid JSON only matching the schema. No prose, no fences.';
    const result = await this.generateText({ ...input, system, temperature: input.temperature ?? 0 });

    let parsed: unknown;
    try {
      const cleaned = result.text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new AIProviderError('failed to parse JSON', this.name, err);
    }

    const validated = input.schema.safeParse(parsed);
    if (!validated.success) {
      throw new AIProviderError(`Anthropic response did not match schema: ${validated.error.message}`, this.name);
    }
    return { data: validated.data, tokens: result.tokens, model: result.model, provider: this.name };
  }

  async generateEmbedding(_input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    throw new AIProviderError('Anthropic does not provide embeddings; use OpenAI or Gemini', this.name);
  }
}
