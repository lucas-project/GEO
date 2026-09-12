/**
 * Normalize simulation brand leaderboard — merge duplicates and drop non-brands.
 */

import { z } from 'zod';
import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import type { BrandMention, SimulationRun } from './schemas';

const refineLogger = logger.child({ module: 'brand-leaderboard-refine' });

const GENERIC_TERMS = new Set(
  [
    'energy',
    'efficiency',
    'quality',
    'price',
    'cost',
    'service',
    'system',
    'series',
    'model',
    'unit',
    'units',
    'brand',
    'brands',
    'product',
    'products',
    'company',
    'manufacturer',
    'retailer',
    'store',
    'online',
    'local',
    'best',
    'top',
    'leading',
    'popular',
    'color',
    'power',
    'smart',
    'home',
    'commercial',
    'residential',
  ].map((s) => s.toLowerCase()),
);

const PRODUCT_LINE_SUFFIX =
  /\b(series|system|unit|model|conditioner|split|ducted|window|inverter|heat pump|aircon|ac)\b/i;

const RefineSchema = z.object({
  brands: z.array(
    z.object({
      name: z.string().min(1),
      mentionCount: z.number().int().min(1),
    }),
  ),
});

function foldBrandKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleCaseBrand(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parentBrandFromProductLine(label: string): string | null {
  const trimmed = label.trim();
  if (!PRODUCT_LINE_SUFFIX.test(trimmed)) return null;
  const first = trimmed.split(/\s+/)[0];
  if (!first || first.length < 2 || GENERIC_TERMS.has(first.toLowerCase())) return null;
  return titleCaseBrand(first);
}

function heuristicRefine(candidates: BrandMention[]): BrandMention[] {
  const merged = new Map<string, { display: string; count: number }>();

  for (const { brand, count } of candidates) {
    const raw = brand.trim();
    if (raw.length < 2) continue;

    const lower = raw.toLowerCase();
    if (GENERIC_TERMS.has(lower)) continue;
    if (/^\d+$/.test(lower)) continue;

    let canonical = raw;
    const parent = parentBrandFromProductLine(raw);
    if (parent) canonical = parent;

    if (GENERIC_TERMS.has(canonical.toLowerCase())) continue;

    const key = foldBrandKey(canonical);
    const existing = merged.get(key);
    if (existing) {
      existing.count += count;
      if (canonical.length < existing.display.length) existing.display = canonical;
    } else {
      merged.set(key, { display: titleCaseBrand(canonical), count });
    }
  }

  return [...merged.values()]
    .map(({ display, count }) => ({ brand: display, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function collectCandidates(runs: SimulationRun[]): BrandMention[] {
  const counts = new Map<string, number>();
  for (const r of runs) {
    for (const m of r.brandMentions) {
      const key = foldBrandKey(m.brand);
      counts.set(key, (counts.get(key) ?? 0) + m.count);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ brand: key, count }))
    .sort((a, b) => b.count - a.count);
}

async function llmRefine(
  runs: SimulationRun[],
  candidates: BrandMention[],
): Promise<BrandMention[] | null> {
  if (config.ai.provider === 'mock' || candidates.length === 0) return null;

  const combined = runs
    .map((r) => r.responseText)
    .join('\n\n---\n\n')
    .slice(0, 6000);
  const candidateList = candidates
    .slice(0, 24)
    .map((c) => `- ${c.brand} (${c.count}×)`)
    .join('\n');

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: RefineSchema,
      schemaName: 'BrandLeaderboardRefine',
      system: `You classify extracted mention labels from AI search responses into a clean brand leaderboard.

Include ONLY:
- Company / manufacturer / retailer brand names (e.g. Midea, Samsung, Harvey Norman)

Exclude:
- Generic words (energy, quality, system)
- Product model lines unless the line IS the brand (collapse "Midea Ducted System" → Midea)
- Typos that are not real brands (e.g. "mideau" → Midea if clearly meant, else drop)
- Duplicate casing variants (merge midea + Midea)

Return canonical brand names with total mention counts across the response.`,
      prompt: `AI search responses:
"""
${combined}
"""

Candidate labels (may include junk):
${candidateList}

Return JSON { "brands": [{ "name": "Canonical Brand", "mentionCount": N }, ...] } sorted by mentionCount desc. Max 12 brands.`,
    });

    const brands = data.brands
      .filter((b) => b.name.trim().length >= 2 && !GENERIC_TERMS.has(b.name.toLowerCase()))
      .map((b) => ({ brand: titleCaseBrand(b.name), count: b.mentionCount }))
      .slice(0, 12);

    return brands.length > 0 ? brands : null;
  } catch (err) {
    refineLogger.warn({ err: (err as Error).message }, 'LLM brand refine failed');
    return null;
  }
}

/** Heuristic-only brand list (no LLM) — used during batch per-question aggregation. */
export function refineBrandLeaderboardHeuristic(runs: SimulationRun[]): BrandMention[] {
  const candidates = collectCandidates(runs);
  if (candidates.length === 0) return [];
  return heuristicRefine(candidates);
}

/** Merge duplicates and drop generic terms / product-line noise from brand leaderboard. */
export async function refineBrandLeaderboard(runs: SimulationRun[]): Promise<BrandMention[]> {
  const candidates = collectCandidates(runs);
  if (candidates.length === 0) return [];

  const llm = await llmRefine(runs, candidates);
  if (llm) return llm;

  return heuristicRefine(candidates);
}
