import type { Dimension, DimensionScore } from './schemas';
import type { RefCategoryScores, SiteChecklistSignals } from './checklist-schema';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dim(dimensions: Record<Dimension, DimensionScore>, d: Dimension): number {
  return dimensions[d]?.score ?? 0;
}

export interface RefScoreAuxiliary {
  technicalPerformance?: number;
  topicCoverage?: number;
}

export function computeRefCategoryScores(
  dimensions: Record<Dimension, DimensionScore>,
  checklist?: SiteChecklistSignals | null,
  auxiliary?: RefScoreAuxiliary,
): RefCategoryScores {
  const c = checklist;
  let content =
    dim(dimensions, 'answerExtraction') * 0.35 +
    dim(dimensions, 'chunkOptimization') * 0.25 +
    dim(dimensions, 'citationFriendliness') * 0.2 +
    dim(dimensions, 'semanticClarity') * 0.2;

  if (c) {
    if (c.leadHasDefinition) content += 5;
    if (c.questionRatio >= 0.4) content += 5;
    if (c.imageCount > 0 && c.imagesWithGoodAlt / Math.max(c.imageCount, 1) >= 0.6) content += 4;
    if (c.skippedHeadingLevels === 0) content += 3;
    if (c.listCount >= 2) content += 3;
  }

  let fact = dim(dimensions, 'trustSignals');
  if (c) {
    if (c.explicitCitationCount > 0) fact += 8;
    if (c.hasCaseStudySection) fact += 7;
    if (c.termDefinitionHits >= 2) fact += 5;
    if (c.authorWithBio) fact += 5;
  }

  let technical =
    dim(dimensions, 'structuredContent') * 0.35 +
    dim(dimensions, 'crawlerFriendliness') * 0.35 +
    dim(dimensions, 'semanticClarity') * 0.3;

  if (auxiliary?.technicalPerformance != null) {
    technical = technical * 0.7 + auxiliary.technicalPerformance * 0.3;
  }
  if (auxiliary?.topicCoverage != null) {
    technical = technical * 0.85 + auxiliary.topicCoverage * 0.15;
  }
  if (c && c.internalLinkCount >= 5) technical += 4;

  const entity =
    dim(dimensions, 'offSitePresence') * 0.55 + dim(dimensions, 'entityClarity') * 0.45;

  let commercial =
    dim(dimensions, 'commercialReadiness') * 0.7 +
    dim(dimensions, 'citationFriendliness') * 0.15 +
    dim(dimensions, 'semanticClarity') * 0.15;

  if (c?.minHopsToPricing != null && c.minHopsToPricing <= 2) commercial += 6;

  const contentExtractability = clamp(content);
  const factAuthority = clamp(fact);
  const technicalDiscoverability = clamp(technical);
  const entityConsistency = clamp(entity);
  const commercialConversion = clamp(commercial);

  const weighted =
    contentExtractability * 0.25 +
    factAuthority * 0.25 +
    technicalDiscoverability * 0.2 +
    entityConsistency * 0.15 +
    commercialConversion * 0.15;

  const refScore1000 = Math.round(weighted * 10);

  return {
    contentExtractability,
    factAuthority,
    technicalDiscoverability,
    entityConsistency,
    commercialConversion,
    refScore1000,
    tier: refTierFromScore(refScore1000),
  };
}

function refTierFromScore(ref1000: number): RefCategoryScores['tier'] {
  if (ref1000 >= 850) return 'leader';
  if (ref1000 >= 700) return 'competitor';
  if (ref1000 >= 550) return 'chaser';
  if (ref1000 >= 400) return 'laggard';
  return 'blind';
}

export const REF_TIER_LABELS: Record<RefCategoryScores['tier'], string> = {
  leader: 'GEO leader',
  competitor: 'GEO competitor',
  chaser: 'GEO chaser',
  laggard: 'GEO laggard',
  blind: 'GEO blind spot',
};
