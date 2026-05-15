/**
 * Google Gemini provider — optional, lazy-loaded.
 *
 * To enable: install `@google/generative-ai` and set AI_PROVIDER=gemini + GOOGLE_API_KEY.
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

type GeminiModule = typeof import('@google/generative-ai');
type GeminiClient = InstanceType<GeminiModule['GoogleGenerativeAI']>;

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private clientPromise: Promise<GeminiClient> | null = null;

  private async client(): Promise<GeminiClient> {
    if (!config.ai.gemini.apiKey) {
      throw new AIProviderError('GOOGLE_API_KEY not set', this.name);
    }
    if (!this.clientPromise) {
      this.clientPromise = import('@google/generative-ai')
        .then((mod) => new mod.GoogleGenerativeAI(config.ai.gemini.apiKey))
        .catch((err) => {
          throw new AIProviderError(
            '@google/generative-ai not installed; run `npm install @google/generative-ai`',
            this.name,
            err,
          );
        });
    }
    return this.clientPromise;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const genAI = await this.client();
    const modelName = input.model ?? config.ai.gemini.model;
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: input.system,
    });
    const t0 = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxTokens,
      },
    });
    aiLogger.info({ provider: this.name, model: modelName, latencyMs: Date.now() - t0 }, 'generateText');

    const text = result.response.text();
    const usage = result.response.usageMetadata;
    return {
      text,
      tokens: {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
        total: usage?.totalTokenCount ?? 0,
      },
      model: modelName,
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
      throw new AIProviderError(`Gemini response did not match schema: ${validated.error.message}`, this.name);
    }
    return { data: validated.data, tokens: result.tokens, model: result.model, provider: this.name };
  }

  async generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    const genAI = await this.client();
    const modelName = input.model ?? 'text-embedding-004';
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.embedContent(input.text);
    return {
      vector: result.embedding.values,
      tokens: { input: 0, output: 0, total: 0 },
      model: modelName,
      provider: this.name,
    };
  }
}
