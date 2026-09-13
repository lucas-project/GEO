/**
 * Entity extractor — LLM-driven, Zod-validated.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import { EntitySchema, type Entity, type SchemaBlock } from '../schemas';
import { ENTITY_EXTRACTION_SYSTEM, buildEntityPrompt } from '../prompts/entities';

const ResponseSchema = z.object({
  entities: z.array(EntitySchema.omit({ source: true, evidence: true })),
});

const SCHEMA_ENTITY_TYPES: Record<string, Entity['kind']> = {
  Organization: 'organization',
  Corporation: 'organization',
  LocalBusiness: 'organization',
  Product: 'product',
  SoftwareApplication: 'product',
  Person: 'person',
  Place: 'place',
};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function evidenceSnippet(text: string, name: string): string | null {
  const index = normalize(text).indexOf(normalize(name));
  if (index < 0) return null;
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + name.length + 160);
  return text.slice(start, end).trim();
}

function schemaEntities(input: { url: string; schemas?: SchemaBlock[] }): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const schema of input.schemas ?? []) {
    const kind = SCHEMA_ENTITY_TYPES[schema.type];
    const raw = schema.raw as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!kind || !name) continue;
    const key = `${kind}:${normalize(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      kind,
      count: 1,
      relevance: 0.95,
      source: 'schema',
      evidence: { url: input.url, text: name },
    });
  }
  return out;
}

export async function extractEntities(input: {
  url: string;
  title: string;
  bodyText: string;
  schemas?: SchemaBlock[];
}): Promise<Entity[]> {
  const observedFromSchema = schemaEntities(input);
  if (input.bodyText.length < 80 || ai.name === 'mock') return observedFromSchema;
  try {
    const { data } = await ai.generateStructuredOutput({
      schema: ResponseSchema,
      schemaName: 'EntityExtraction',
      system: ENTITY_EXTRACTION_SYSTEM,
      prompt: buildEntityPrompt(input),
    });
    const seen = new Set(observedFromSchema.map((entity) => `${entity.kind}:${normalize(entity.name)}`));
    const grounded = data.entities.flatMap((entity) => {
      const snippet = evidenceSnippet(input.bodyText, entity.name);
      const key = `${entity.kind}:${normalize(entity.name)}`;
      if (!snippet || seen.has(key)) return [];
      seen.add(key);
      return [{ ...entity, source: 'page_text' as const, evidence: { url: input.url, text: snippet } }];
    });
    return [...observedFromSchema, ...grounded].slice(0, 25);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'entity extraction failed; using empty list');
    return observedFromSchema;
  }
}
