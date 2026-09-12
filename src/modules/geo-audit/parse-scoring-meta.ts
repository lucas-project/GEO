import { z } from 'zod';
import { parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { ScoringMetaSchema, type ScoringMeta } from './schemas';

const metaLogger = logger.child({ module: 'geo-audit-scoring-meta' });

const SimulationVisibilityCheckSchema = ScoringMetaSchema.shape.simulationVisibilityCheck;

export function parseScoringMeta(json: string | null | undefined): ScoringMeta | null {
  if (!json || json === '{}') return null;
  const parsed = parseJson<unknown>(json, null);
  if (!parsed) return null;
  const result = ScoringMetaSchema.safeParse(parsed);
  if (result.success) return result.data;
  metaLogger.warn(
    { issues: result.error.issues.slice(0, 5).map((i) => i.path.join('.')) },
    'scoringMeta strict parse failed',
  );
  return null;
}

export function readSimulationVisibilityCheck(
  json: string | null | undefined,
): NonNullable<ScoringMeta['simulationVisibilityCheck']> | null {
  if (!json) return null;
  const parsed = parseJson<unknown>(json, null);
  if (!parsed || typeof parsed !== 'object') return null;
  const check = (parsed as Record<string, unknown>).simulationVisibilityCheck;
  const result = SimulationVisibilityCheckSchema.safeParse(check);
  return result.success && result.data != null ? result.data : null;
}

export function readSimulationVisibilityHistory(
  json: string | null | undefined,
): NonNullable<ScoringMeta['simulationVisibilityCheck']>[] {
  if (!json) return [];
  const parsed = parseJson<unknown>(json, null);
  if (!parsed || typeof parsed !== 'object') return [];
  const history = (parsed as Record<string, unknown>).simulationVisibilityHistory;
  if (!Array.isArray(history)) return [];
  return history.flatMap((entry) => {
    const result = SimulationVisibilityCheckSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

export function mergeScoringMetaPatch(
  json: string | null | undefined,
  patch: Record<string, unknown>,
): string {
  const raw = parseJson<Record<string, unknown>>(json ?? '{}', {});
  return JSON.stringify({ ...raw, ...patch });
}
