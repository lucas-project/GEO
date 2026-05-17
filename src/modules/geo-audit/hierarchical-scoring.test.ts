import { describe, expect, it } from 'vitest';
import {
  computeHierarchicalScore,
  applyPipelineGates,
  computeLayerScores,
  applyCitationSnapshotCap,
} from './hierarchical-scoring';
import type { Dimension, DimensionScore } from './schemas';

function dim(score: number, reasons: string[] = []): DimensionScore {
  return { score, reasons };
}

function allDims(overrides: Partial<Record<Dimension, number>>): Record<Dimension, DimensionScore> {
  const base: Record<Dimension, number> = {
    aiReadability: 80,
    citationFriendliness: 80,
    semanticClarity: 80,
    entityClarity: 80,
    answerExtraction: 80,
    chunkOptimization: 80,
    summarizationQuality: 80,
    trustSignals: 80,
    structuredContent: 80,
    crawlerFriendliness: 80,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, dim(v)]),
  ) as Record<Dimension, DimensionScore>;
}

describe('hierarchical-scoring', () => {
  it('caps overall when crawler is blocked', () => {
    const dimensions = allDims({ crawlerFriendliness: 20 });
    const { overallScore, scoringMeta } = computeHierarchicalScore({ dimensions });
    expect(overallScore).toBeLessThanOrEqual(40);
    expect(scoringMeta.bottleneck.layer).toBe('foundation');
    expect(scoringMeta.gatesApplied.some((g) => g.type === 'crawler_blocked')).toBe(true);
  });

  it('caps citation outcome when answer extraction is low', () => {
    const dimensions = allDims({
      answerExtraction: 30,
      citationFriendliness: 90,
    });
    const layers = computeLayerScores(dimensions);
    const gated = applyPipelineGates(layers, dimensions);
    expect(gated.layers.outcome.effectiveScore).toBeLessThanOrEqual(55);
    expect(gated.gatesApplied.some((g) => g.type === 'answer_extraction_ceiling')).toBe(true);
  });

  it('applies citation snapshot cap on probability', () => {
    const dimensions = allDims({});
    const { scoringMeta } = computeHierarchicalScore({
      dimensions,
      citationVisibility: 0.2,
    });
    expect(scoringMeta.citationProbability).toBeLessThanOrEqual(0.3);
    expect(scoringMeta.gatesApplied.some((g) => g.type === 'citation_snapshot')).toBe(true);
  });

  it('produces reasonable heuristic probability for strong pages', () => {
    const dimensions = allDims({});
    const { scoringMeta } = computeHierarchicalScore({ dimensions });
    expect(scoringMeta.citationProbability).toBeGreaterThan(0.4);
    expect(scoringMeta.modelVersion).toBe('hierarchical-v1');
  });

  it('applyCitationSnapshotCap respects margin', () => {
    const { probability } = applyCitationSnapshotCap(0.8, 0.2, 0.1);
    expect(probability).toBeLessThanOrEqual(0.3);
  });
});
