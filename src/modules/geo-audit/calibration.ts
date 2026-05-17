/**
 * Data-driven calibration hooks for hierarchical scoring weights.
 *
 * v1: static defaults; when corpus is large enough, nudge layer multipliers
 * based on dimension–citation visibility correlation from rollups.
 */

import { prisma } from '@shared/database/client';
import { config } from '@shared/config';
import type { ScoreLayer } from './schemas';

export interface CalibrationWeights {
  layerMultipliers: Partial<Record<ScoreLayer, number>>;
  source: 'static' | 'corpus';
}

const STATIC_WEIGHTS: CalibrationWeights = {
  layerMultipliers: {},
  source: 'static',
};

/**
 * Returns layer weight multipliers for hierarchical scoring.
 * Corpus adjustment is capped at ±15% per layer when enough rollups exist.
 */
export async function getCalibrationWeights(siteId?: string | null): Promise<CalibrationWeights> {
  if (!siteId) return STATIC_WEIGHTS;

  const rollupCount = await prisma.auditRollup.count();
  if (rollupCount < config.intelligence.minCalibrationSamples) {
    return STATIC_WEIGHTS;
  }

  const rollups = await prisma.auditRollup.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      dimensionScores: true,
    },
  });

  if (rollups.length < 5) {
    const globalCount = await prisma.auditRollup.count();
    if (globalCount < config.intelligence.minCalibrationSamples) {
      return STATIC_WEIGHTS;
    }
  }

  const snaps = await prisma.citationSnapshot.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { targetVisibilityScore: true },
  });

  if (snaps.length === 0) return STATIC_WEIGHTS;

  const visibility = snaps[0].targetVisibilityScore;
  if (visibility <= 0) return STATIC_WEIGHTS;

  const maxAdj = config.scoring.calibrationMaxAdjustment;
  const layerMultipliers: Partial<Record<ScoreLayer, number>> = {};

  if (visibility >= 0.5) {
    layerMultipliers.outcome = 1 + maxAdj * 0.5;
    layerMultipliers.foundation = 1 - maxAdj * 0.25;
  } else if (visibility < 0.2) {
    layerMultipliers.foundation = 1 + maxAdj * 0.5;
    layerMultipliers.outcome = 1 - maxAdj * 0.25;
  }

  if (Object.keys(layerMultipliers).length === 0) {
    return STATIC_WEIGHTS;
  }

  return { layerMultipliers, source: 'corpus' };
}
