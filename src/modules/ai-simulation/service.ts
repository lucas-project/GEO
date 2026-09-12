/**
 * AI Simulation service — Phase 2 entry point.
 *
 * Models the AI Simulation Engine described in blueprint Section 4.4:
 *   - Run a prompt across simulated platforms (ChatGPT, Gemini, Claude, Perplexity)
 *   - Track which brands/URLs each platform cites
 *   - Aggregate "AI visibility" for a target brand
 */

import { randomId } from '@shared/util/id';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { runOnAllPlatforms, SIMULATED_PLATFORMS } from '@shared/ai/multi';
import { findSimilarChunks, type AuditChunkSearch } from '@modules/embeddings';
import { extractCitations, extractCitationsForPlatforms } from './citation-tracker';
import { refineBrandLeaderboard, refineBrandLeaderboardHeuristic } from './brand-leaderboard-refine';
import { buildMockSimulationResponse, canonicalBrandName, type MockSimPlatform } from './mock-responses';
import { config } from '@shared/config';
import {
  PLATFORMS,
  type Platform,
  type SimulationRun,
  type SimulationResult,
} from './schemas';

const simLogger = logger.child({ module: 'ai-simulation' });

const JUNK_DOMAINS = new Set([
  'github.com',
  'wikipedia.org',
  'nytimes.com',
  'medium.com',
  'stackoverflow.com',
  'forbes.com',
  'techcrunch.com',
  'theverge.com',
]);

const JUNK_BRANDS = new Set(
  [
    'openai',
    'google',
    'microsoft',
    'amazon',
    'anthropic',
    'yoast',
    'apple',
    'github',
    'wikipedia',
    'stackoverflow',
    'forbes',
    'medium',
  ].map((s) => s.toLowerCase()),
);

function isJunkBrand(brand: string): boolean {
  const b = brand.toLowerCase().trim();
  return JUNK_BRANDS.has(b) || b.length < 2;
}

export interface RunSimulationInput {
  prompt: string;
  targetBrand?: string;
  targetUrl?: string;
  siteId?: string;
  runsPerPlatform?: number;
  /** Optional GEO audit id — top similar chunks are prepended as retrieval context */
  contextAuditId?: string;
  /** Reuse loaded chunk vectors across batch prompts (from createAuditChunkSearch). */
  contextSearch?: AuditChunkSearch;
  /** How citations are extracted — batch defaults to combined-llm. */
  citationMode?: 'full' | 'regex' | 'combined-llm';
  /** @deprecated Use citationMode */
  citationUseLlm?: boolean;
  /** Defer citation snapshot until batch completes. */
  skipCitationSnapshot?: boolean;
  /** Batch fast path: skip per-question LLM brand refine (landscape refined once at batch end). */
  skipBrandRefine?: boolean;
  /** Batch fast path: fewer RAG chunks attached per prompt. */
  contextTopK?: number;
  /** Batch fast path: one Ollama model + shorter max tokens. */
  platformRunOptions?: { singleModel?: boolean; maxTokens?: number };
  onProgress?: (progress: number, message: string) => void;
}

export async function runSimulation(input: RunSimulationInput): Promise<SimulationResult> {
  const runId = randomId();
  simLogger.info({ runId, prompt: input.prompt }, 'simulation starting');
  input.onProgress?.(10, 'Querying simulated AI platforms…');

  let effectivePrompt = input.prompt;
  if (input.contextSearch) {
    try {
      const topK = input.contextTopK ?? 5;
      const similar = await input.contextSearch(input.prompt, topK);
      if (similar.length) {
        const block = similar.map((s) => s.textPreview).join('\n---\n');
        effectivePrompt = `Relevant excerpts from the audited site (retrieved):\n${block}\n\nUser task:\n${input.prompt}`;
        simLogger.info({ n: similar.length }, 'retrieval context attached (cached search)');
      }
    } catch (err) {
      simLogger.warn({ err: (err as Error).message }, 'retrieval context skipped');
    }
  } else if (input.contextAuditId) {
    try {
      const similar = await findSimilarChunks(input.contextAuditId, input.prompt, 5);
      if (similar.length) {
        const block = similar.map((s) => s.textPreview).join('\n---\n');
        effectivePrompt = `Relevant excerpts from the audited site (retrieved):\n${block}\n\nUser task:\n${input.prompt}`;
        simLogger.info({ auditId: input.contextAuditId, n: similar.length }, 'retrieval context attached');
      }
    } catch (err) {
      simLogger.warn({ err: (err as Error).message }, 'retrieval context skipped');
    }
  }

  const perPlatformRuns = input.runsPerPlatform ?? 1;
  const platformResponses = await runOnAllPlatforms({
    prompt: effectivePrompt,
    perPlatformRuns,
    targetBrand: input.targetBrand,
    targetUrl: input.targetUrl,
    runOptions: input.platformRunOptions,
  });

  input.onProgress?.(60, 'Extracting citations…');

  const citationMode =
    input.citationMode ??
    (input.citationUseLlm === false
      ? 'regex'
      : config.simulation.llmCitationExtraction &&
          config.simulation.aiProvider !== 'ollama' &&
          config.ai.provider !== 'mock'
        ? 'full'
        : 'regex');

  const extracted = await extractCitationsForPlatforms(
    platformResponses.map((r) => ({ platform: r.platform, text: r.text })),
    citationMode,
  );

  const runs: SimulationRun[] = await Promise.all(
    platformResponses.map(async (r, i) => {
      const { citations, brandMentions } = extracted[i]!;
      const run: SimulationRun = {
        id: randomId(),
        platform: r.platform,
        responseText: r.text,
        citations,
        brandMentions,
        model: r.model,
        provider: r.provider,
        tokens: r.tokens,
      };

      await prisma.aiSimulation.create({
        data: {
          id: run.id,
          siteId: input.siteId ?? null,
          prompt: input.prompt,
          platform: run.platform,
          runId,
          targetBrand: input.targetBrand ?? null,
          responseText: run.responseText,
          citations: stringifyJson(citations),
          brandMentions: stringifyJson(brandMentions),
        },
      });

      return run;
    }),
  );

  input.onProgress?.(85, 'Aggregating visibility…');

  const aggregate = await buildAggregate(runs, input.targetBrand, input.targetUrl, {
    skipBrandRefine: input.skipBrandRefine,
  });

  const result: SimulationResult = {
    runId,
    prompt: input.prompt,
    runs,
    aggregate,
    createdAt: new Date().toISOString(),
  };

  simLogger.info(
    {
      runId,
      totalCitations: result.aggregate.totalCitations,
      brandLeaderLen: result.aggregate.brandLeaderboard.length,
    },
    'simulation complete',
  );

  if (input.siteId && !input.skipCitationSnapshot) {
    const { ingestCitationSnapshot } = await import('@modules/intelligence');
    void ingestCitationSnapshot(input.siteId).catch((err) => {
      simLogger.warn({ err: (err as Error).message, siteId: input.siteId }, 'citation snapshot ingest skipped');
    });
  }

  return result;
}

function brandMatchesTarget(brand: string, targetBrand: string, targetHost: string | null): boolean {
  const canonical = canonicalBrandName(targetBrand).toLowerCase();
  const b = brand.toLowerCase();
  if (b.includes(canonical) || canonical.includes(b)) return true;
  if (targetHost) {
    const hostStem = targetHost.replace(/^www\./, '').split('.')[0]?.toLowerCase() ?? '';
    if (hostStem.length > 2 && (b.includes(hostStem) || hostStem.includes(b))) return true;
  }
  return false;
}

async function buildAggregate(
  runs: SimulationRun[],
  targetBrand?: string,
  targetUrl?: string,
  options?: { skipBrandRefine?: boolean },
): Promise<SimulationResult['aggregate']> {
  let totalCitations = 0;
  const domainCounts = new Map<string, number>();
  const brandPlatforms = new Map<string, Set<Platform>>();

  for (const r of runs) {
    totalCitations += r.citations.length;
    for (const m of r.brandMentions) {
      if (isJunkBrand(m.brand)) continue;
      const key = m.brand;
      if (!brandPlatforms.has(key)) brandPlatforms.set(key, new Set());
      brandPlatforms.get(key)!.add(r.platform);
    }
    for (const c of r.citations) {
      if (!c.domain) continue;
      const d = c.domain.replace(/^www\./, '');
      if (JUNK_DOMAINS.has(d)) continue;
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }

  const brandLeaderboard = options?.skipBrandRefine
    ? refineBrandLeaderboardHeuristic(runs)
    : await refineBrandLeaderboard(runs);

  const domainLeaderboard = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  let targetVisibility: SimulationResult['aggregate']['targetVisibility'] = null;
  if (targetBrand?.trim()) {
    let targetHost: string | null = null;
    if (targetUrl) {
      try {
        targetHost = new URL(
          targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`,
        ).hostname;
      } catch {
        targetHost = null;
      }
    }
    const displayBrand = canonicalBrandName(targetBrand);
    const platforms: Platform[] = [];
    for (const [brand, set] of brandPlatforms.entries()) {
      if (brandMatchesTarget(brand, targetBrand, targetHost)) {
        for (const p of set) if (!platforms.includes(p)) platforms.push(p);
      }
    }
    for (const r of runs) {
      if (platforms.includes(r.platform)) continue;
      const hostHit =
        targetHost &&
        r.citations.some((c) => c.domain && c.domain.replace(/^www\./, '') === targetHost.replace(/^www\./, ''));
      const textHit =
        targetHost &&
        r.responseText.toLowerCase().includes(targetHost.replace(/^www\./, '').toLowerCase());
      if (hostHit || textHit) platforms.push(r.platform);
    }
    targetVisibility = {
      brand: displayBrand,
      mentionedOnPlatforms: platforms,
      visibilityScore: Math.round((platforms.length / SIMULATED_PLATFORMS.length) * 100),
    };
  }

  return { totalCitations, brandLeaderboard, domainLeaderboard, targetVisibility };
}

export async function getSimulation(runId: string): Promise<SimulationResult | null> {
  const rows = await prisma.aiSimulation.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) return null;

  const targetBrand = rows[0].targetBrand ?? undefined;

  // Re-parse citations from response text (ignores stale junk stored in DB).
  // Upgrade legacy mock filler to HVAC-aware answers on read.
  const runs: SimulationRun[] = await Promise.all(
    rows.map(async (r) => {
      let responseText = r.responseText;
      if (
        config.ai.provider === 'mock' &&
        responseText.includes('Schema.org markup and FAQ blocks')
      ) {
        responseText = buildMockSimulationResponse({
          prompt: rows[0].prompt,
          platform: r.platform as MockSimPlatform,
          targetBrand,
        });
      }
      const { citations, brandMentions } = await extractCitations(responseText);
      return {
        id: r.id,
        platform: r.platform as Platform,
        responseText,
        citations,
        brandMentions,
        model: r.responseText.includes('mock-simulation') ? 'mock-simulation-v1' : 'persisted',
        provider: citations.length > 0 ? 'recomputed' : 'persisted',
        tokens: { input: 0, output: 0, total: 0 },
      };
    }),
  );

  return {
    runId,
    prompt: rows[0].prompt,
    runs,
    aggregate: await buildAggregate(runs, targetBrand, undefined),
    createdAt: rows[0].createdAt.toISOString(),
  };
}

export async function listRecentSimulations(limit = 20): Promise<Array<{
  runId: string;
  prompt: string;
  createdAt: string;
  platformCount: number;
}>> {
  const rows = await prisma.aiSimulation.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit * PLATFORMS.length,
  });
  const grouped = new Map<string, { prompt: string; createdAt: Date; platformCount: number }>();
  for (const r of rows) {
    if (!r.runId) continue;
    const existing = grouped.get(r.runId);
    if (existing) existing.platformCount += 1;
    else grouped.set(r.runId, { prompt: r.prompt, createdAt: r.createdAt, platformCount: 1 });
  }
  return [...grouped.entries()]
    .map(([runId, v]) => ({
      runId,
      prompt: v.prompt,
      createdAt: v.createdAt.toISOString(),
      platformCount: v.platformCount,
    }))
    .slice(0, limit);
}

export const aiSimulationService = {
  runSimulation,
  getSimulation,
  listRecentSimulations,
};
