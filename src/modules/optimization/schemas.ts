/**
 * Optimization module schemas.
 */

import { z } from 'zod';

export const ARTIFACT_TYPES = [
  'faq-schema',
  'llms-txt',
  'ai-summary',
  'answer-first',
  'product-schema',
  'metadata',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const GeneratedArtifactSchema = z.object({
  id: z.string(),
  auditId: z.string(),
  type: z.enum(ARTIFACT_TYPES),
  targetUrl: z.string().nullable(),
  content: z.string(),
  contentFormat: z.enum(['json', 'text', 'html', 'markdown']),
  rationale: z.string(),
  applied: z.boolean(),
  createdAt: z.string(),
});
export type GeneratedArtifact = z.infer<typeof GeneratedArtifactSchema>;
