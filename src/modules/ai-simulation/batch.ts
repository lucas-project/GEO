/**
 * Run multiple simulation prompts in one job and aggregate visibility results.
 */

import { mapPool } from '@/lib/map-pool';
import { config } from '@shared/config';
import { warmOllamaSimulationModels } from '@shared/ai/ollama-warm';
import { createAuditChunkSearch, type AuditChunkSearch } from '@modules/embeddings';
import { runSimulation } from './service';
import type { BrandMention, Platform, SimulationResult } from './schemas';
import { buildCitationHighlights } from './visibility-highlights';
import { aggregateDiscoveryLandscape, inferPromptType } from './batch-aggregate';
import { logger } from '@shared/logger';

const batchLogger = logger.child({ module: 'ai-simulation-batch' });

export type SimulationQuestionType = 'brand' | 'discovery';

export interface SimulationBatchPrompt {
  text: string;
  type?: SimulationQuestionType;
}

export interface SimulationBatchResultItem {
  prompt: string;
  runId: string;
  questionType: SimulationQuestionType;
  visibilityScore: number;
  mentionedOnPlatforms: Platform[];
  platformDetails: Array<{
    platform: Platform;
    cited: boolean;
    citationCount: number;
    citedDomains: string[];
    excerpts?: string[];
  }>;
  citationHighlights?: Array<{
    platform: Platform;
    snippet: string;
    brand?: string;
    domain?: string;
  }>;
}

export interface SimulationBatchResult {
  results: SimulationBatchResultItem[];
  /** Discovery questions only — headline visibility metrics. */
  promptsTested: number;
  promptsCiting: number;
  averageVisibilityScore: number;
  brandPromptsTested: number;
  checkedAt: string;
  /** Market landscape from discovery questions in this batch (updates each run). */
  brandLeaderboard: BrandMention[];
  domainLeaderboard: Array<{ domain: string; count: number }>;
}

export interface RunSimulationBatchInput {
  prompts: SimulationBatchPrompt[];
  targetBrand?: string;
  targetUrl?: string;
  siteId?: string;
  contextAuditId?: string;
  onProgress?: (progress: number, message: string) => void;
  shouldAbort?: () => Promise<boolean>;
}

function batchConcurrencyLimit(): number {
  const configured = config.simulation.batchConcurrency;
  if (configured > 0) return configured;
  return config.simulation.aiProvider === 'ollama' ? 1 : 2;
}

function toBatchResultItem(
  prompt: string,
  questionType: SimulationQuestionType,
  sim: SimulationResult,
  targetBrand?: string,
  targetUrl?: string,
): SimulationBatchResultItem {
  const visibility = sim.aggregate.targetVisibility;
  const mentioned = visibility?.mentionedOnPlatforms ?? [];
  const highlights = buildCitationHighlights(sim, targetBrand, targetUrl);

  const platformDetails = sim.runs.map((r) => {
    const cited = mentioned.includes(r.platform);
    const citedDomains = [
      ...new Set(
        r.citations
          .map((c) => c.domain?.replace(/^www\./, '') ?? '')
          .filter((d) => d.length > 0),
      ),
    ].slice(0, 5);
    const excerpts = highlights
      .filter((h) => h.platform === r.platform)
      .map((h) => h.snippet)
      .slice(0, 2);
    return {
      platform: r.platform,
      cited,
      citationCount: r.citations.length,
      citedDomains,
      excerpts: excerpts.length > 0 ? excerpts : undefined,
    };
  });

  return {
    prompt,
    runId: sim.runId,
    questionType,
    visibilityScore: visibility?.visibilityScore ?? 0,
    mentionedOnPlatforms: mentioned,
    platformDetails,
    citationHighlights: highlights.length > 0 ? highlights : undefined,
  };
}

export async function runSimulationBatch(
  input: RunSimulationBatchInput,
): Promise<SimulationBatchResult> {
  const entries = input.prompts
    .map((p) => ({
      text: p.text.trim(),
      type: p.type ?? inferPromptType(p.text, input.targetBrand),
    }))
    .filter((p) => p.text.length >= 3);

  if (entries.length === 0) {
    throw new Error('At least one valid prompt is required');
  }

  let chunkSearch: AuditChunkSearch | null = null;
  if (input.contextAuditId) {
    try {
      chunkSearch = await createAuditChunkSearch(input.contextAuditId);
    } catch (err) {
      batchLogger.warn({ err: (err as Error).message }, 'chunk search cache skipped');
    }
  }

  input.onProgress?.(1, 'Preparing local model…');
  await warmOllamaSimulationModels();

  const citationMode = 'regex' as const;

  const platformRunOptions =
    config.simulation.aiProvider === 'ollama'
      ? {
          singleModel: config.simulation.batchSingleModel,
          maxTokens: config.simulation.batchMaxTokens,
        }
      : { maxTokens: config.simulation.batchMaxTokens };

  const concurrency = batchConcurrencyLimit();
  let completed = 0;

  const paired = await mapPool(entries, concurrency, async (entry, index) => {
    if (await input.shouldAbort?.()) {
      throw new Error('Interrupted: batch cancelled');
    }

    input.onProgress?.(
      Math.round((completed / entries.length) * 88) + 2,
      `Testing question ${index + 1} of ${entries.length}…`,
    );

    const sim = await runSimulation({
      prompt: entry.text,
      targetBrand: input.targetBrand,
      targetUrl: input.targetUrl,
      siteId: input.siteId,
      // Discovery: no site RAG — simulates a shopper query without feeding your pages to the model.
      contextAuditId: entry.type === 'discovery' ? undefined : input.contextAuditId,
      contextSearch: entry.type === 'discovery' ? undefined : chunkSearch ?? undefined,
      contextTopK: entry.type === 'discovery' ? 0 : 2,
      citationMode,
      skipBrandRefine: true,
      skipCitationSnapshot: true,
      platformRunOptions,
      onProgress: (p, msg) => {
        const slot = (completed + p / 100) / entries.length;
        input.onProgress?.(Math.round(slot * 88) + 2, msg);
      },
    });

    completed += 1;
    input.onProgress?.(
      Math.round((completed / entries.length) * 88) + 2,
      `Finished question ${completed} of ${entries.length}`,
    );

    batchLogger.info(
      {
        prompt: entry.text.slice(0, 60),
        questionType: entry.type,
        visibilityScore: sim.aggregate.targetVisibility?.visibilityScore ?? 0,
      },
      'batch prompt complete',
    );

    return {
      item: toBatchResultItem(entry.text, entry.type, sim, input.targetBrand, input.targetUrl),
      sim,
    };
  });

  input.onProgress?.(92, 'Summarizing discovery visibility…');

  const results = paired.map((p) => p.item);
  const discoveryPairs = paired.filter((p) => p.item.questionType === 'discovery');

  const discoveryResults = results.filter((r) => r.questionType === 'discovery');
  const brandResults = results.filter((r) => r.questionType === 'brand');

  const promptsCiting = discoveryResults.filter((r) => r.visibilityScore > 0).length;
  const averageVisibilityScore =
    discoveryResults.length > 0
      ? Math.round(
          discoveryResults.reduce((s, r) => s + r.visibilityScore, 0) / discoveryResults.length,
        )
      : 0;

  const landscape = await aggregateDiscoveryLandscape(
    discoveryPairs.map((p) => p.sim),
  );

  if (input.siteId) {
    const { ingestCitationSnapshot } = await import('@modules/intelligence');
    void ingestCitationSnapshot(input.siteId).catch((err) => {
      batchLogger.warn({ err: (err as Error).message, siteId: input.siteId }, 'citation snapshot ingest skipped');
    });
  }

  return {
    results,
    promptsTested: discoveryResults.length,
    promptsCiting,
    averageVisibilityScore,
    brandPromptsTested: brandResults.length,
    brandLeaderboard: landscape.brandLeaderboard,
    domainLeaderboard: landscape.domainLeaderboard,
    checkedAt: new Date().toISOString(),
  };
}
