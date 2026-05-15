/**
 * Chunk embeddings — stores vectors as JSON for SQLite; swap to pgvector in prod.
 */

import { ai } from '@shared/ai';
import { config } from '@shared/config';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import type { PageExtraction } from '@modules/extraction';

const log = logger.child({ module: 'embeddings' });

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export async function indexChunksForAudit(auditId: string, extraction: PageExtraction): Promise<void> {
  const max = config.embeddings.maxChunksPerAudit;
  const chunks = extraction.chunks.slice(0, max);
  if (chunks.length === 0) return;

  await prisma.chunkEmbedding.deleteMany({ where: { auditId } });

  let embedModel = '';
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].text.slice(0, 8000);
    try {
      const { vector, model } = await ai.generateEmbedding({ text });
      embedModel = model;
      await prisma.chunkEmbedding.create({
        data: {
          auditId,
          chunkIndex: i,
          textPreview: text.slice(0, 500),
          dimensions: vector.length,
          vector: stringifyJson(vector),
          model,
        },
      });
    } catch (err) {
      log.warn({ err: (err as Error).message, auditId, i }, 'chunk embedding skipped');
    }
  }
  log.info({ auditId, count: chunks.length, model: embedModel }, 'chunk embeddings indexed');
}

export async function findSimilarChunks(
  auditId: string,
  queryText: string,
  topK = 8,
): Promise<Array<{ chunkIndex: number; textPreview: string; score: number }>> {
  const { vector: qv } = await ai.generateEmbedding({ text: queryText.slice(0, 8000) });
  const rows = await prisma.chunkEmbedding.findMany({ where: { auditId } });
  const scored = rows
    .map((r) => {
      const v = parseJson<number[]>(r.vector, []);
      return {
        chunkIndex: r.chunkIndex,
        textPreview: r.textPreview,
        score: cosineSimilarity(qv, v),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

export const embeddingsService = {
  indexChunksForAudit,
  findSimilarChunks,
};
