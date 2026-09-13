import { z } from 'zod';

export const SiteProfileRelationSchema = z.enum([
  'manufacturer',
  'dealer',
  'marketplace',
  'publisher',
  'product',
  'service',
  'unknown',
]);

export const SiteProfileSchema = z.object({
  version: z.string(),
  primaryEntity: z.object({
    name: z.string(),
    role: SiteProfileRelationSchema,
    evidenceIds: z.array(z.string()),
  }),
  aliases: z.array(z.string()),
  offerings: z.array(z.string()),
  customerSegments: z.array(z.string()),
  markets: z.array(z.string()),
  languages: z.array(z.string()),
  relatedEntities: z.array(
    z.object({
      name: z.string(),
      relation: SiteProfileRelationSchema,
      evidenceIds: z.array(z.string()),
    }),
  ),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  confirmationState: z.enum(['draft', 'needs_review', 'confirmed']),
});

export type SiteProfile = z.infer<typeof SiteProfileSchema>;
