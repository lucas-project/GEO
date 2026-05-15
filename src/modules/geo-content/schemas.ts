import { z } from 'zod';
import { GEO_CONTENT_FORMATS } from './formats';

export const GeoContentFormatSchema = z.enum([
  'qa',
  'step_by_step',
  'comparison',
  'definition',
  'concise_answer',
  'professional_explanation',
]);
export type GeoContentFormat = z.infer<typeof GeoContentFormatSchema>;

export const GeoContentKeywordSchema = z.object({
  term: z.string(),
  relevance: z.number().min(0).max(1),
  source: z.enum(['heading', 'title', 'description', 'faq', 'body']),
});
export type GeoContentKeyword = z.infer<typeof GeoContentKeywordSchema>;

/** One block per content type — prompts cover all keywords together. */
export const GeoContentSectionSchema = z.object({
  format: GeoContentFormatSchema,
  prompts: z.array(z.string().min(4)).min(5).max(12),
});
export type GeoContentSection = z.infer<typeof GeoContentSectionSchema>;

export const GeoContentPackSchema = z.object({
  inferredTopic: z.string(),
  audience: z.string(),
  positioning: z.string(),
  sections: z.array(GeoContentSectionSchema).length(GEO_CONTENT_FORMATS.length),
});
export type GeoContentPack = z.infer<typeof GeoContentPackSchema>;
