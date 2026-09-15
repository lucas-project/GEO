import 'server-only';

import { z } from 'zod';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import { extractRelevantKeywords } from '@modules/geo-content';
import type { PageExtraction } from '@modules/extraction';
import {
  DIMENSION_LABELS,
  DIMENSIONS,
  type Dimension,
  type DimensionScore,
} from './schemas';
import {
  resolveQuestionTypes,
  SIMULATION_PROMPTS_PER_TYPE,
  collectUniquePromptEntries,
  type SimulationPromptEntry,
  type SimulationQuestionType,
  type SimulationQuestionTypesInput,
} from './simulation-prompts';
import {
  categoryCompetitorSeeds,
  serperCompetitorUrls,
} from './competitor-heuristics';

const genLogger = logger.child({ module: 'geo-audit-suggestions' });

const SimulationPromptsBatchSchema = z.object({
  prompts: z.array(z.string()),
});

const CompetitorsSchema = z.object({
  competitors: z.array(z.string()),
});

const MAX_PROMPT_GENERATION_ATTEMPTS = 4;
const PROMPT_GENERATION_MAX_TOKENS = 4096;

export function deriveSiteKeywordsFromExtraction(extraction: PageExtraction): string[] {
  const chunkTexts = extraction.chunks
    .filter((c) => c.text.length > 40)
    .map((c) => c.text.slice(0, 400))
    .slice(0, 8);

  const extracted = extractRelevantKeywords({
    title: extraction.metadata.title ?? '',
    description: extraction.metadata.description ?? '',
    headings: extraction.headings.map((h) => h.text).slice(0, 24),
    faqQuestions: extraction.faqs.map((f) => f.question),
    chunkTexts,
    tableTexts: [],
    limit: 10,
  });

  return [...new Set(extracted.keywords.map((k) => k.term))].slice(0, 10);
}

function weakDimensionLines(dimensions: Record<Dimension, DimensionScore>): string[] {
  return (Object.entries(dimensions) as [Dimension, DimensionScore][])
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 4)
    .map(([dim, d]) => `${DIMENSION_LABELS[dim]} (${d.score}/100): ${d.reasons[0] ?? ''}`);
}

function buildTypePrompt(
  type: SimulationQuestionType,
  brandName: string,
  count: number,
): string {
  if (type === 'brand') {
    return `Generate exactly ${count} distinct brand-specific AI search queries. Each MUST include the brand name "${brandName}". Test whether AI correctly surfaces facts from the brand's website (specs, warranty, product lines, support, policies). Vary intent: comparisons, how-to, policy, product specs, support. Examples: "What is ${brandName}'s warranty on…?", "${brandName} vs … for …".`;
  }
  return `Generate exactly ${count} distinct customer-discovery AI search queries. Each MUST NOT mention "${brandName}" or any specific vendor. Write from a shopper who only knows their need — "best … for …", "which … has … feature", comparisons, buying research. The brand should ideally appear in AI answers without being named in the question.`;
}

async function generatePromptsForType(input: {
  url: string;
  brandName: string;
  dimensions: Record<Dimension, DimensionScore>;
  siteKeywords?: string[];
  type: SimulationQuestionType;
}): Promise<SimulationPromptEntry[]> {
  const collected: SimulationPromptEntry[] = [];
  const seen = new Set<string>();
  const weakDims = weakDimensionLines(input.dimensions);
  const keywordsLine =
    input.siteKeywords && input.siteKeywords.length > 0
      ? `\nSite keywords: ${input.siteKeywords.slice(0, 8).join(', ')}`
      : '';

  for (
    let attempt = 0;
    attempt < MAX_PROMPT_GENERATION_ATTEMPTS &&
    collected.length < SIMULATION_PROMPTS_PER_TYPE;
    attempt++
  ) {
    const need = SIMULATION_PROMPTS_PER_TYPE - collected.length;
    const excludeBlock =
      seen.size > 0
        ? `\n\nAlready generated (do NOT repeat or paraphrase closely):\n${[...seen]
            .slice(0, 40)
            .map((p) => `- ${p}`)
            .join('\n')}`
        : '';

    const prompt = `Brand: ${input.brandName}
URL: ${input.url}${keywordsLine}
Weakest GEO dimensions:
${weakDims.map((d) => `- ${d}`).join('\n')}

${buildTypePrompt(input.type, input.brandName, need)}${excludeBlock}

Return JSON: { "prompts": ["question 1", "question 2", ...] }
The prompts array MUST contain exactly ${need} strings.`;

    try {
      const { data } = await ai.generateStructuredOutput({
        schema: SimulationPromptsBatchSchema,
        schemaName: 'SimulationPromptsBatch',
        maxTokens: PROMPT_GENERATION_MAX_TOKENS,
        system:
          'You are a GEO expert. Generate realistic natural-language questions people type into ChatGPT, Gemini, Claude, or Perplexity. Return JSON only — no markdown fences.',
        prompt,
        temperature: attempt === 0 ? 0.35 : 0.5,
      });

      const batch = collectUniquePromptEntries(
        data.prompts,
        input.type,
        seen,
        need,
      );
      collected.push(...batch);
    } catch (err) {
      genLogger.warn(
        { err: (err as Error).message, type: input.type, attempt },
        'simulation prompt batch failed',
      );
    }
  }

  if (collected.length < SIMULATION_PROMPTS_PER_TYPE) {
    genLogger.warn(
      { type: input.type, count: collected.length, target: SIMULATION_PROMPTS_PER_TYPE },
      'simulation prompts under target count',
    );
  }

  return collected.slice(0, SIMULATION_PROMPTS_PER_TYPE);
}

async function generateCompetitorsOnly(input: {
  url: string;
  brandName: string;
  dimensions: Record<Dimension, DimensionScore>;
  siteKeywords?: string[];
}): Promise<string[]> {
  const weakDims = weakDimensionLines(input.dimensions);
  const keywordsLine =
    input.siteKeywords && input.siteKeywords.length > 0
      ? `\nSite keywords: ${input.siteKeywords.slice(0, 8).join(', ')}`
      : '';

  const prompt = `Brand: ${input.brandName}
URL: ${input.url}${keywordsLine}
Weakest GEO dimensions:
${weakDims.map((d) => `- ${d}`).join('\n')}

Return 3-5 direct competitor website URLs (https://...) in the same product/service category (not directories).

Return JSON: { "competitors": ["https://..."] }`;

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: CompetitorsSchema,
      schemaName: 'CompetitorSuggestions',
      maxTokens: 1024,
      system:
        'You are a market researcher. Return JSON only with competitor homepage URLs.',
      prompt,
    });

    const llmUrls = data.competitors
      .slice(0, 5)
      .filter((c) => typeof c === 'string' && c.startsWith('http'));
    if (llmUrls.length >= 2) return llmUrls;
  } catch (err) {
    genLogger.warn({ err: (err as Error).message }, 'LLM competitor suggestions failed');
  }

  const serper = await serperCompetitorUrls(input.brandName, input.url);
  if (serper.length > 0) {
    genLogger.info({ count: serper.length }, 'competitor suggestions from Serper fallback');
    return serper;
  }

  const seeds = categoryCompetitorSeeds(input.url, input.siteKeywords ?? []);
  if (seeds.length > 0) {
    genLogger.info({ count: seeds.length }, 'competitor suggestions from category seeds');
  }
  return seeds;
}

/** Generate simulation prompts (per type, 10 each) and competitor URLs. */
export async function generateAuditSuggestions(input: {
  url: string;
  brandName: string;
  dimensions: Record<Dimension, DimensionScore>;
  siteKeywords?: string[];
  questionTypes?: SimulationQuestionTypesInput;
}): Promise<{ prompts: SimulationPromptEntry[]; competitors: string[] }> {
  const types = resolveQuestionTypes(input.questionTypes);

  const promptsPromise =
    types.length > 0
      ? Promise.all(
          types.map((type) =>
            generatePromptsForType({
              url: input.url,
              brandName: input.brandName,
              dimensions: input.dimensions,
              siteKeywords: input.siteKeywords,
              type,
            }),
          ),
        ).then((batches) => batches.flat())
      : Promise.resolve([] as SimulationPromptEntry[]);

  const [prompts, competitors] = await Promise.all([
    promptsPromise.catch((err) => {
      genLogger.warn({ err: (err as Error).message }, 'simulation prompt generation failed');
      return [] as SimulationPromptEntry[];
    }),
    generateCompetitorsOnly(input),
  ]);

  return { prompts, competitors };
}

/** Free-tier fallback: deterministic category seeds only, with no model call. */
export function generateDeterministicAuditSuggestions(_input: {
  url: string;
  siteKeywords?: string[];
}): { prompts: SimulationPromptEntry[]; competitors: string[] } {
  void _input;
  // Automatic competitor guesses are intentionally withheld in the free tier;
  // users can submit explicit URLs for validation once the candidate workflow
  // is enabled. This avoids presenting category seeds as confirmed rivals.
  return {
    prompts: [],
    competitors: [],
  };
}

export async function generateSimulationQuestions(input: {
  url: string;
  brandName: string;
  dimensions: Record<Dimension, DimensionScore>;
  siteKeywords?: string[];
  questionTypes?: SimulationQuestionTypesInput;
}): Promise<SimulationPromptEntry[]> {
  const { prompts } = await generateAuditSuggestions(input);
  return prompts;
}

export async function generateCompetitorSuggestions(input: {
  url: string;
  brandName: string;
  siteKeywords?: string[];
  dimensions?: Record<Dimension, DimensionScore>;
}): Promise<string[]> {
  const neutralDims = DIMENSIONS.reduce((out, d) => {
    out[d] = { score: 50, reasons: [] };
    return out;
  }, {} as Record<Dimension, DimensionScore>);

  return generateCompetitorsOnly({
    url: input.url,
    brandName: input.brandName,
    dimensions: input.dimensions ?? neutralDims,
    siteKeywords: input.siteKeywords,
  });
}
