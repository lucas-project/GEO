import { describe, expect, it } from 'vitest';
import { computeRefCategoryScores } from './ref-category-scores';
import { DIMENSIONS, type Dimension, type DimensionScore } from './schemas';

function dims(scores: Partial<Record<Dimension, number>>): Record<Dimension, DimensionScore> {
  const out = {} as Record<Dimension, DimensionScore>;
  for (const d of DIMENSIONS) {
    out[d] = { score: scores[d] ?? 70, reasons: [] };
  }
  return out;
}

describe('computeRefCategoryScores', () => {
  it('maps dimensions to A–E categories and ref tier', () => {
    const ref = computeRefCategoryScores(dims({ answerExtraction: 90, trustSignals: 85 }));
    expect(ref.contentExtractability).toBeGreaterThan(60);
    expect(ref.factAuthority).toBeGreaterThan(60);
    expect(ref.refScore1000).toBeGreaterThan(0);
    expect(['leader', 'competitor', 'chaser', 'laggard', 'blind']).toContain(ref.tier);
  });

  it('boosts content when checklist signals are strong', () => {
    const base = computeRefCategoryScores(dims({}));
    const boosted = computeRefCategoryScores(dims({}), {
      leadHasDefinition: true,
      questionRatio: 0.5,
      questionHeadingCount: 2,
      h2h3Count: 4,
      imageCount: 4,
      imagesWithGoodAlt: 4,
      imagesMissingAlt: 0,
      videoCount: 0,
      videosWithTranscript: 0,
      skippedHeadingLevels: 0,
      listCount: 3,
      sectionCount: 4,
      sectionsInDefinitionBand: 2,
      explicitCitationCount: 0,
      hasAccordingTo: false,
      hasCaseStudySection: false,
      quantifiedOutcomes: 0,
      termDefinitionHits: 0,
      authorWithBio: false,
      internalLinkCount: 0,
      anchorDiversity: 0,
      hasPricingLink: false,
      hasSignupLink: false,
      minHopsToPricing: null,
    });
    expect(boosted.contentExtractability).toBeGreaterThanOrEqual(base.contentExtractability);
  });
});
