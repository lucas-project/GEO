import { z } from 'zod';

export const SIMULATION_QUESTION_TYPES = ['brand', 'discovery'] as const;
export type SimulationQuestionType = (typeof SIMULATION_QUESTION_TYPES)[number];

/** How many questions we request and keep per type on each generate/regenerate. */
export const SIMULATION_PROMPTS_PER_TYPE = 10;

export const SimulationPromptEntrySchema = z.object({
  prompt: z.string(),
  type: z.enum(SIMULATION_QUESTION_TYPES),
});
export type SimulationPromptEntry = z.infer<typeof SimulationPromptEntrySchema>;

export const SIMULATION_QUESTION_TYPE_LABELS: Record<SimulationQuestionType, string> = {
  brand: 'Brand-specific',
  discovery: 'Customer discovery',
};

export const SIMULATION_QUESTION_TYPE_DESCRIPTIONS: Record<SimulationQuestionType, string> = {
  brand:
    'Includes your brand name — tests whether AI correctly surfaces facts from your site (specs, policies, product lines).',
  discovery:
    'No brand named — simulates a shopper query with no site context or keyword hints. Scoring checks whether AI mentions you anyway.',
};

export interface SimulationQuestionTypesInput {
  brand?: boolean;
  discovery?: boolean;
}

export function resolveQuestionTypes(
  input?: SimulationQuestionTypesInput,
): SimulationQuestionType[] {
  if (!input) return [...SIMULATION_QUESTION_TYPES];
  const types: SimulationQuestionType[] = [];
  if (input.brand !== false) types.push('brand');
  if (input.discovery !== false) types.push('discovery');
  return types;
}

export function simulationPromptText(
  entry: string | SimulationPromptEntry,
): string {
  return typeof entry === 'string' ? entry : entry.prompt;
}

/** Normalize legacy string[] or typed entries into SimulationPromptEntry[]. */
export function normalizeSimulationPrompts(
  raw: (string | SimulationPromptEntry)[] | undefined,
  brandName?: string,
): SimulationPromptEntry[] {
  if (!raw?.length) return [];
  const brandNeedle = brandName?.trim().toLowerCase();
  return raw
    .map((item) => {
      if (typeof item !== 'string') {
        return { prompt: item.prompt.trim(), type: item.type };
      }
      const prompt = item.trim();
      if (!prompt) return null;
      const inferred: SimulationQuestionType =
        brandNeedle && prompt.toLowerCase().includes(brandNeedle) ? 'brand' : 'discovery';
      return { prompt, type: inferred };
    })
    .filter((e): e is SimulationPromptEntry => Boolean(e?.prompt));
}

export function countSimulationPrompts(
  raw: (string | SimulationPromptEntry)[] | undefined,
): number {
  return normalizeSimulationPrompts(raw).length;
}

export function expectedSimulationPromptCount(
  selectedTypes: SimulationQuestionType[],
): number {
  return selectedTypes.length * SIMULATION_PROMPTS_PER_TYPE;
}

export function collectUniquePromptEntries(
  raw: string[],
  type: SimulationQuestionType,
  seen: Set<string>,
  limit: number,
): SimulationPromptEntry[] {
  const added: SimulationPromptEntry[] = [];
  for (const p of raw) {
    if (added.length >= limit) break;
    if (typeof p !== 'string') continue;
    const trimmed = p.trim();
    if (trimmed.length < 3) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ prompt: trimmed, type });
  }
  return added;
}

/** Replace the stored list with generated prompts for the selected types only (up to 10 each). */
export function applyGeneratedSimulationPrompts(
  generated: SimulationPromptEntry[],
  selectedTypes: SimulationQuestionType[],
): SimulationPromptEntry[] {
  const buckets: Record<SimulationQuestionType, SimulationPromptEntry[]> = {
    brand: [],
    discovery: [],
  };
  const seen = new Set<string>();

  for (const entry of generated) {
    if (!selectedTypes.includes(entry.type)) continue;
    const bucket = buckets[entry.type];
    if (bucket.length >= SIMULATION_PROMPTS_PER_TYPE) continue;
    const key = `${entry.type}:${entry.prompt.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bucket.push(entry);
  }

  const result: SimulationPromptEntry[] = [];
  for (const type of selectedTypes) {
    result.push(...buckets[type]);
  }
  return result;
}
