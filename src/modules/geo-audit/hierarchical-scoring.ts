/**
 * Hierarchical GEO scoring — AI visibility pipeline with gating.
 *
 * Layers: foundation → understanding → presence → generation → outcome.
 * Overall score and citation probability reflect upstream bottlenecks,
 * not a flat average of 10 independent dimensions.
 */

import { config } from '@shared/config';
import type { PresenceSignals } from '@modules/brand-presence';
import {
  SCORE_LAYERS,
  DIMENSION_LAYERS,
  DIMENSION_LABELS,
  LAYER_LABELS,
  type Dimension,
  type DimensionScore,
  type ScoreLayer,
  type LayerScore,
  type ScoringMeta,
  type Bottleneck,
  type GateApplied,
} from './schemas';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function weightedMean(
  entries: Array<{ score: number; weight: number }>,
): number {
  if (entries.length === 0) return 0;
  let sum = 0;
  let w = 0;
  for (const e of entries) {
    sum += e.score * e.weight;
    w += e.weight;
  }
  return w > 0 ? sum / w : 0;
}

function dimensionsInLayer(layer: ScoreLayer): Dimension[] {
  return (Object.keys(DIMENSION_LAYERS) as Dimension[]).filter(
    (d) => DIMENSION_LAYERS[d] === layer,
  );
}

function weakestInLayer(
  layer: ScoreLayer,
  dimensions: Record<Dimension, DimensionScore>,
): Dimension {
  const dims = dimensionsInLayer(layer);
  return dims.reduce((a, b) =>
    dimensions[a].score <= dimensions[b].score ? a : b,
  );
}

export function computeLayerScores(
  dimensions: Record<Dimension, DimensionScore>,
  layerWeightMultipliers?: Partial<Record<ScoreLayer, number>>,
): Record<ScoreLayer, LayerScore> {
  const layers = {} as Record<ScoreLayer, LayerScore>;

  for (const layer of SCORE_LAYERS) {
    const dims = dimensionsInLayer(layer);
    const weights = config.scoring.layerDimensionWeights[layer];
    const multiplier = layerWeightMultipliers?.[layer] ?? 1;

    const entries = dims.map((d) => ({
      score: dimensions[d].score,
      weight: (weights[d as keyof typeof weights] ?? 1) * multiplier,
    }));

    const rawScore = clamp(weightedMean(entries));
    const weakest = weakestInLayer(layer, dimensions);

    layers[layer] = {
      layer,
      rawScore,
      effectiveScore: rawScore,
      dimensions: dims,
      weakestDimension: weakest,
    };
  }

  return layers;
}

export interface PipelineGateResult {
  layers: Record<ScoreLayer, LayerScore>;
  gatesApplied: GateApplied[];
  overallCap?: number;
  citationCeiling?: number;
}

export function applyPipelineGates(
  layers: Record<ScoreLayer, LayerScore>,
  dimensions: Record<Dimension, DimensionScore>,
): PipelineGateResult {
  const gates: GateApplied[] = [];
  const gatesCfg = config.scoring.gates;
  let overallCap: number | undefined;
  let citationCeiling: number | undefined;

  const crawlerScore = dimensions.crawlerFriendliness.score;

  if (crawlerScore < gatesCfg.crawlerBlockedThreshold) {
    overallCap = gatesCfg.crawlerBlockedCap;
    gates.push({
      type: 'crawler_blocked',
      description: `AI crawlers are blocked or severely restricted (crawler score ${crawlerScore})`,
      cap: overallCap,
    });
  } else if (crawlerScore < gatesCfg.crawlerWeakThreshold) {
    overallCap = gatesCfg.crawlerWeakCap;
    gates.push({
      type: 'crawler_weak',
      description: `AI crawler access is limited (crawler score ${crawlerScore})`,
      cap: overallCap,
    });
  }

  const foundationRaw = layers.foundation.rawScore;
  if (foundationRaw < gatesCfg.foundationWeakThreshold) {
    gates.push({
      type: 'foundation_weak',
      description: `Foundation layer is weak (${foundationRaw}/100) — downstream layers capped`,
    });
  }

  const answerScore = dimensions.answerExtraction.score;
  for (const rule of gatesCfg.answerExtractionCeilings) {
    if (answerScore < rule.maxScore) {
      citationCeiling = rule.citationCap;
      gates.push({
        type: 'answer_extraction_ceiling',
        description: `Answer extraction is low (${answerScore}) — citation capped at ${rule.citationCap}`,
        cap: rule.citationCap,
      });
      break;
    }
  }

  const offSiteScore = dimensions.offSitePresence?.score;
  if (
    offSiteScore !== undefined &&
    offSiteScore < gatesCfg.offSitePresenceWeakThreshold
  ) {
    const cap = gatesCfg.offSitePresenceOutcomeCap;
    citationCeiling =
      citationCeiling !== undefined ? Math.min(citationCeiling, cap) : cap;
    gates.push({
      type: 'off_site_presence_weak',
      description: `Off-site presence is weak (${offSiteScore}) — outcome capped at ${cap}`,
      cap,
    });
  }

  const effective = { ...layers };
  const factor = gatesCfg.propagationFactor;
  const buffer = gatesCfg.layerBuffer;

  effective.foundation = {
    ...effective.foundation,
    effectiveScore: effective.foundation.rawScore,
  };

  effective.understanding = {
    ...effective.understanding,
    effectiveScore: clamp(
      Math.min(
        effective.understanding.rawScore,
        effective.foundation.effectiveScore * factor + buffer,
      ),
    ),
  };

  effective.presence = {
    ...effective.presence,
    effectiveScore: clamp(
      Math.min(
        effective.presence.rawScore,
        effective.understanding.effectiveScore * factor + buffer,
      ),
    ),
  };

  effective.generation = {
    ...effective.generation,
    effectiveScore: clamp(
      Math.min(
        effective.generation.rawScore,
        effective.presence.effectiveScore * factor + buffer,
      ),
    ),
  };

  let outcomeEffective = clamp(
    Math.min(
      effective.outcome.rawScore,
      effective.generation.effectiveScore * factor + buffer,
    ),
  );

  if (citationCeiling !== undefined) {
    outcomeEffective = Math.min(outcomeEffective, citationCeiling);
  }

  effective.outcome = {
    ...effective.outcome,
    effectiveScore: outcomeEffective,
  };

  if (
    effective.understanding.effectiveScore < effective.understanding.rawScore ||
    effective.presence.effectiveScore < effective.presence.rawScore ||
    effective.generation.effectiveScore < effective.generation.rawScore ||
    effective.outcome.effectiveScore < effective.outcome.rawScore
  ) {
    gates.push({
      type: 'propagation',
      description: 'Upstream layer weakness propagated to downstream scores',
    });
  }

  return {
    layers: effective,
    gatesApplied: gates,
    overallCap,
    citationCeiling,
  };
}

export function computeOverallScore(
  layers: Record<ScoreLayer, LayerScore>,
  overallCap?: number,
): number {
  const blend = config.scoring.layerBlend;
  let score = 0;
  for (const layer of SCORE_LAYERS) {
    score += layers[layer].effectiveScore * blend[layer];
  }
  score = clamp(score);
  if (overallCap !== undefined) {
    score = Math.min(score, overallCap);
  }
  return score;
}

export function computeCitationProbability(
  layers: Record<ScoreLayer, LayerScore>,
): number {
  const product =
    (layers.foundation.effectiveScore / 100) *
    (layers.understanding.effectiveScore / 100) *
    (layers.presence.effectiveScore / 100) *
    (layers.generation.effectiveScore / 100) *
    (layers.outcome.effectiveScore / 100);

  let p = product;
  for (const layer of SCORE_LAYERS) {
    if (layers[layer].effectiveScore < 50) {
      p *= 0.85;
    }
  }

  return Math.max(0, Math.min(1, Math.round(p * 1000) / 1000));
}

export function detectBottleneck(
  layers: Record<ScoreLayer, LayerScore>,
  dimensions: Record<Dimension, DimensionScore>,
): Bottleneck {
  let worstLayer: ScoreLayer = 'foundation';
  let worstScore = 101;

  for (const layer of SCORE_LAYERS) {
    const s = layers[layer].effectiveScore;
    if (s < worstScore) {
      worstScore = s;
      worstLayer = layer;
    }
  }

  const dimension = layers[worstLayer].weakestDimension ?? weakestInLayer(worstLayer, dimensions);
  const dimScore = dimensions[dimension];
  const negativeReason = dimScore.reasons.find((r) => !/^aggregated across/i.test(r));

  const reason =
    negativeReason ??
    `${DIMENSION_LABELS[dimension]} is the weakest link in the ${LAYER_LABELS[worstLayer]} layer (${dimScore.score}/100).`;

  return {
    layer: worstLayer,
    dimension,
    effectiveScore: worstScore,
    reason,
  };
}

export function applyCitationSnapshotCap(
  probability: number,
  visibility: number,
  margin = config.scoring.citationSnapshotMargin,
): { probability: number; gate: GateApplied } {
  const capped = Math.min(probability, visibility + margin);
  return {
    probability: Math.max(0, Math.min(1, Math.round(capped * 1000) / 1000)),
    gate: {
      type: 'citation_snapshot',
      description: `Calibrated with simulation data (observed visibility ${Math.round(visibility * 100)}%)`,
    },
  };
}

export interface HierarchicalScoreInput {
  dimensions: Record<Dimension, DimensionScore>;
  citationVisibility?: number | null;
  simulationRunCount?: number;
  layerWeightMultipliers?: Partial<Record<ScoreLayer, number>>;
  presenceSignals?: PresenceSignals;
}

export interface HierarchicalScoreResult {
  overallScore: number;
  scoringMeta: ScoringMeta;
}

export function computeHierarchicalScore(input: HierarchicalScoreInput): HierarchicalScoreResult {
  const rawLayers = computeLayerScores(input.dimensions, input.layerWeightMultipliers);
  const gated = applyPipelineGates(rawLayers, input.dimensions);
  const overallScore = computeOverallScore(gated.layers, gated.overallCap);

  let citationProbability = computeCitationProbability(gated.layers);
  const gatesApplied = [...gated.gatesApplied];

  if (input.citationVisibility != null && input.citationVisibility >= 0) {
    const snap = applyCitationSnapshotCap(citationProbability, input.citationVisibility);
    citationProbability = snap.probability;
    gatesApplied.push(snap.gate);
  }

  const bottleneck = detectBottleneck(gated.layers, input.dimensions);

  const scoringMeta: ScoringMeta = {
    modelVersion: 'hierarchical-v2',
    layers: gated.layers,
    citationProbability,
    bottleneck,
    gatesApplied,
    overallCap: gated.overallCap,
    citationSnapshotVisibility:
      input.citationVisibility != null ? input.citationVisibility : undefined,
    simulationRunCount: input.simulationRunCount,
    presenceSignals: input.presenceSignals,
  };

  return { overallScore, scoringMeta };
}

/** Fallback for legacy audits without stored scoringMeta. */
export function deriveScoringMetaFromDimensions(
  dimensions: Record<Dimension, DimensionScore>,
): ScoringMeta {
  return computeHierarchicalScore({ dimensions }).scoringMeta;
}
