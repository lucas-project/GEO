/**
 * Extraction module schemas.
 */

import { z } from 'zod';

export const PageMetadataSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  ogTitle: z.string().nullable(),
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

export const EntitySchema = z.object({
  name: z.string(),
  kind: z.enum(['organization', 'product', 'person', 'place', 'date', 'concept', 'other']),
  count: z.number().int().min(1),
  relevance: z.number().min(0).max(1),
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
});
export type AuthorSignal = z.infer<typeof AuthorSignalSchema>;

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
});
export type PageExtraction = z.infer<typeof PageExtractionSchema>;
