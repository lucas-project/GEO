/**
 * Extraction module schemas.
 */

import { z } from 'zod';

export const PageMetadataSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  ogTitle: z.string().nullable(),
  ogSiteName: z.string().nullable(),
  ogDescription: z.string().nullable(),
  ogType: z.string().nullable(),
  twitterCard: z.string().nullable(),
  language: z.string().nullable(),
  charset: z.string().nullable(),
  robots: z.string().nullable(),
});
export type PageMetadata = z.infer<typeof PageMetadataSchema>;

export const HeadingSchema = z.object({
  level: z.number().int().min(1).max(6),
  text: z.string(),
});
export type Heading = z.infer<typeof HeadingSchema>;

export const FaqEntrySchema = z.object({
  question: z.string(),
  answer: z.string(),
  source: z.enum(['schema', 'details', 'heuristic']),
});
export type FaqEntry = z.infer<typeof FaqEntrySchema>;

export const SchemaBlockSchema = z.object({
  type: z.string(),
  raw: z.unknown(),
});
export type SchemaBlock = z.infer<typeof SchemaBlockSchema>;

export const EntitySourceSchema = z.enum(['schema', 'page_text', 'model', 'synthetic']);
export type EntitySource = z.infer<typeof EntitySourceSchema>;

/**
 * Entity facts must declare how they were obtained. Legacy rows have no source
 * and are deliberately excluded from downstream comparative/intelligence use.
 */
export const EntitySchema = z.object({
  name: z.string(),
  kind: z.enum(['organization', 'product', 'person', 'place', 'date', 'concept', 'other']),
  count: z.number().int().min(1),
  relevance: z.number().min(0).max(1),
  source: EntitySourceSchema.optional(),
  evidence: z
    .object({
      url: z.string(),
      text: z.string(),
    })
    .optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const SemanticChunkSchema = z.object({
  id: z.string(),
  heading: z.string().nullable(),
  text: z.string(),
  wordCount: z.number().int(),
  hasAnswerFirstSentence: z.boolean(),
  hasList: z.boolean(),
  hasNumbers: z.boolean(),
});
export type SemanticChunk = z.infer<typeof SemanticChunkSchema>;

export const LinkInfoSchema = z.object({
  href: z.string(),
  text: z.string(),
  isInternal: z.boolean(),
  rel: z.string().nullable(),
});
export type LinkInfo = z.infer<typeof LinkInfoSchema>;

export const ComparisonTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caption: z.string().nullable(),
});
export type ComparisonTable = z.infer<typeof ComparisonTableSchema>;

export const AuthorSignalSchema = z.object({
  source: z.enum(['meta', 'schema', 'rel-author', 'byline']),
  name: z.string(),
  bioSnippet: z.string().optional(),
});
export type AuthorSignal = z.infer<typeof AuthorSignalSchema>;

export const PageChecklistSignalsSchema = z.object({
  media: z.object({
    imageCount: z.number().int(),
    imagesWithGoodAlt: z.number().int(),
    imagesMissingAlt: z.number().int(),
    videoCount: z.number().int(),
    videosWithTranscript: z.number().int(),
  }),
  definitions: z.object({
    leadHasDefinition: z.boolean(),
    leadWordCount: z.number().int(),
    sectionsInDefinitionBand: z.number().int(),
    sectionCount: z.number().int(),
    termDefinitionHits: z.number().int(),
  }),
  citations: z.object({
    explicitCitationCount: z.number().int(),
    hasAccordingTo: z.boolean(),
    hasSourceLabel: z.boolean(),
    hasYearAndOrg: z.boolean(),
  }),
  caseStudies: z.object({
    caseStudyMentions: z.number().int(),
    quantifiedOutcomes: z.number().int(),
    hasCaseStudySection: z.boolean(),
  }),
  questionHeadings: z.object({
    questionHeadingCount: z.number().int(),
    h2h3Count: z.number().int(),
    questionRatio: z.number(),
  }),
  internalLinks: z.object({
    internalCount: z.number().int(),
    uniquePathKinds: z.array(z.string()),
    hasPricingLink: z.boolean(),
    hasSignupLink: z.boolean(),
    anchorDiversity: z.number().int(),
  }),
  listCount: z.number().int(),
  skippedHeadingLevels: z.number().int(),
  enrichedInternalLinks: z
    .array(
      z.object({
        href: z.string(),
        text: z.string(),
        pathKind: z.string(),
      }),
    )
    .optional(),
});
export type PageChecklistSignals = z.infer<typeof PageChecklistSignalsSchema>;

export const PageExtractionSchema = z.object({
  url: z.string(),
  metadata: PageMetadataSchema,
  headings: z.array(HeadingSchema),
  schemas: z.array(SchemaBlockSchema),
  faqs: z.array(FaqEntrySchema),
  entities: z.array(EntitySchema),
  chunks: z.array(SemanticChunkSchema),
  links: z.array(LinkInfoSchema),
  tables: z.array(ComparisonTableSchema),
  authors: z.array(AuthorSignalSchema),
  checklist: PageChecklistSignalsSchema,
});
export type PageExtraction = z.infer<typeof PageExtractionSchema>;
