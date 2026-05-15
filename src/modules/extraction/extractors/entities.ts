/**
 * Entity extractor — LLM-driven, Zod-validated.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import { EntitySchema, type Entity } from '../schemas';
import { ENTITY_EXTRACTION_SYSTEM, buildEntityPrompt } from '../prompts/entities';

const ResponseSchema = z.object({
  entities: z.array(EntitySchema),
});

export async function extractEntities(input: {
  url: string;
  title: string;
  bodyText: string;
}): Promise<Entity[]> {
  if (input.bodyText.length < 80) return [];
  try {
    const { data } = await ai.generateStructuredOutput({
      schema: ResponseSchema,
      schemaName: 'EntityExtraction',
      system: ENTITY_EXTRACTION_SYSTEM,
      prompt: buildEntityPrompt(input),
    });
    return data.entities.slice(0, 25);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'entity extraction failed; using empty list');
    return [];
  }
}
