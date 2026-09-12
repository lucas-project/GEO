/**
 * Ollama local LLM provider — chat + embeddings via HTTP API.
 *
 * Set AI_PROVIDER=ollama and run Ollama (https://ollama.com) with your model pulled.
 * Structured outputs use JSON parse + Zod with repair retries.
 */

import { z } from 'zod';
import { config } from '@shared/config';
import { aiLogger } from '@shared/logger';
import { extractJsonBlock } from '../json-parse';
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

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  private base(): string {
    return config.ollama.baseUrl.replace(/\/$/, '');
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const model = input.model ?? config.ollama.model;
    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const t0 = Date.now();
    const res = await fetch(`${this.base()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(input.keepAlive ? { keep_alive: input.keepAlive } : {}),
        options: { temperature: input.temperature ?? 0.2, num_predict: input.maxTokens ?? 1024 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AIProviderError(`Ollama HTTP ${res.status}: ${errText}`, this.name);
    }
    const body = (await res.json()) as { message?: { content?: string } };
    const text = body.message?.content ?? '';
    aiLogger.info({ provider: this.name, model, latencyMs: Date.now() - t0 }, 'generateText');
    const approxIn = Math.ceil((input.prompt.length + (input.system?.length ?? 0)) / 4);
    const approxOut = Math.ceil(text.length / 4);
    return {
      text,
      tokens: { input: approxIn, output: approxOut, total: approxIn + approxOut },
      model,
      provider: this.name,
    };
  }

  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    const model = input.model ?? config.ollama.model;
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
        parsed = JSON.parse(extractJsonBlock(result.text));
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
      `Ollama structured output failed after retries: ${lastErr}`,
      this.name,
    );
  }

  async generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    const model = input.model ?? config.ollama.embedModel;
    const res = await fetch(`${this.base()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: input.text }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AIProviderError(`Ollama embeddings HTTP ${res.status}: ${errText}`, this.name);
    }
    const body = (await res.json()) as { embedding?: number[] };
    const vector = body.embedding ?? [];
    return {
      vector,
      tokens: { input: Math.ceil(input.text.length / 4), output: 0, total: Math.ceil(input.text.length / 4) },
      model,
      provider: this.name,
    };
  }
}
