/**
 * OpenAI provider — optional. SDK is lazy-loaded so the platform still
 * boots without the `openai` package installed (it's an optionalDependency).
 *
 * To enable: install `openai` and set AI_PROVIDER=openai + OPENAI_API_KEY.
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

type OpenAIModule = typeof import('openai');
type OpenAIClient = InstanceType<OpenAIModule['default']>;

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private clientPromise: Promise<OpenAIClient> | null = null;

  private async client(): Promise<OpenAIClient> {
    if (!config.ai.openai.apiKey) {
      throw new AIProviderError('OPENAI_API_KEY not set', this.name);
    }
    if (!this.clientPromise) {
      this.clientPromise = import('openai')
        .then((mod) => new mod.default({ apiKey: config.ai.openai.apiKey }))
        .catch((err) => {
          throw new AIProviderError('openai SDK not installed; run `npm install openai`', this.name, err);
        });
    }
    return this.clientPromise;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const openai = await this.client();
    const model = input.model ?? config.ai.openai.model;
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens,
    });
    aiLogger.info(
      { provider: this.name, model, latencyMs: Date.now() - t0 },
      'generateText',
    );

    const text = completion.choices[0]?.message?.content ?? '';
    return {
      text,
      tokens: {
        input: completion.usage?.prompt_tokens ?? 0,
        output: completion.usage?.completion_tokens ?? 0,
        total: completion.usage?.total_tokens ?? 0,
      },
      model,
      provider: this.name,
    };
  }

  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    // Uses JSON-mode + Zod parse. We don't depend on OpenAI's native
    // zodResponseFormat helper to stay loosely coupled.
    const system = (input.system ?? '') +
      '\n\nYou MUST respond with valid JSON only, matching the requested schema. No prose, no markdown fences.';
    const result = await this.generateText({
      ...input,
      system,
      temperature: input.temperature ?? 0,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonBlockFromModel(result.text));
    } catch (err) {
      throw new AIProviderError('failed to parse JSON from OpenAI response', this.name, err);
    }

    const validated = input.schema.safeParse(parsed);
    if (!validated.success) {
      throw new AIProviderError(
        `OpenAI response did not match schema: ${validated.error.message}`,
        this.name,
      );
    }
    return {
      data: validated.data,
      tokens: result.tokens,
      model: result.model,
      provider: this.name,
    };
  }

  async generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    const openai = await this.client();
    const model = input.model ?? 'text-embedding-3-small';
    const resp = await openai.embeddings.create({ model, input: input.text });
    return {
      vector: resp.data[0]?.embedding ?? [],
      tokens: {
        input: resp.usage?.prompt_tokens ?? 0,
        output: 0,
        total: resp.usage?.total_tokens ?? 0,
      },
      model,
      provider: this.name,
    };
  }
}
