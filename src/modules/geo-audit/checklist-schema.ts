import { z } from 'zod';

export const SiteChecklistSignalsSchema = z.object({
  leadHasDefinition: z.boolean(),
  sectionsInDefinitionBand: z.number().int(),
  sectionCount: z.number().int(),
  questionRatio: z.number(),
  questionHeadingCount: z.number().int(),
  h2h3Count: z.number().int(),
  imagesWithGoodAlt: z.number().int(),
  imagesMissingAlt: z.number().int(),
  imageCount: z.number().int(),
  videoCount: z.number().int(),
  videosWithTranscript: z.number().int(),
  listCount: z.number().int(),
  skippedHeadingLevels: z.number().int(),
  explicitCitationCount: z.number().int(),
  hasAccordingTo: z.boolean(),
  hasCaseStudySection: z.boolean(),
  quantifiedOutcomes: z.number().int(),
  termDefinitionHits: z.number().int(),
  authorWithBio: z.boolean(),
  internalLinkCount: z.number().int(),
  anchorDiversity: z.number().int(),
  hasPricingLink: z.boolean(),
  hasSignupLink: z.boolean(),
  minHopsToPricing: z.number().int().nullable(),
});

export type SiteChecklistSignals = z.infer<typeof SiteChecklistSignalsSchema>;

export const RefCategoryScoresSchema = z.object({
  contentExtractability: z.number().int().min(0).max(100),
  factAuthority: z.number().int().min(0).max(100),
  technicalDiscoverability: z.number().int().min(0).max(100),
  entityConsistency: z.number().int().min(0).max(100),
  commercialConversion: z.number().int().min(0).max(100),
  refScore1000: z.number().int().min(0).max(1000),
  tier: z.enum(['leader', 'competitor', 'chaser', 'laggard', 'blind']),
});

export type RefCategoryScores = z.infer<typeof RefCategoryScoresSchema>;
