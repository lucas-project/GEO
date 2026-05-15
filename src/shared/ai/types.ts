/**
 * AI Provider contract.
 *
 * NEVER import OpenAI/Anthropic/Gemini SDKs directly inside feature modules.
 * Always go through `ai.generateText()` / `ai.generateStructuredOutput()` /
 * `ai.generateEmbedding()` exposed by `shared/ai`.
 *
 * Why: blueprint Section 6 — "Replaceable AI providers" is the single
 * biggest maintainability decision in this codebase.
 */

import type { z } from 'zod';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface GenerateTextInput {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  tokens: TokenUsage;
  model: string;
  provider: string;
}

export interface GenerateStructuredInput<TSchema extends z.ZodTypeAny> {
  prompt: string;
  system?: string;
  schema: TSchema;
  schemaName?: string;
  model?: string;
  temperature?: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  tokens: TokenUsage;
  model: string;
  provider: string;
}

export interface GenerateEmbeddingInput {
  text: string;
  model?: string;
}

export interface GenerateEmbeddingResult {
  vector: number[];
  tokens: TokenUsage;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateStructuredOutput<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>>;
  generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult>;
}

export class AIProviderError extends Error {
  constructor(message: string, public readonly provider: string, public readonly cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = 'AIProviderError';
  }
}
