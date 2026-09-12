import { getEmbeddingsAI } from '@shared/ai';
import type { CrawledPage } from '@modules/crawling';
import { prisma, parseJson } from '@shared/database/client';

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

export function scoreTechnicalPerformance(rootPage: CrawledPage): number {
  const perf = rootPage.performance;
  if (!perf) return 50;

  let score = 50;
  if (perf.lcpMs != null) {
    if (perf.lcpMs <= 2000) score += 30;
    else if (perf.lcpMs <= 3500) score += 12;
    else score -= 15;
  }
  if (perf.mobileBodyTextLength != null) {
    if (perf.mobileBodyTextLength >= 400) score += 20;
    else if (perf.mobileBodyTextLength < 120) score -= 15;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Topic coverage from chunk embeddings vs page title (C3). */
export async function scoreTopicCoverage(
  auditId: string,
  title: string,
): Promise<number | null> {
  const rows = await prisma.chunkEmbedding.findMany({
    where: { auditId },
    select: { vector: true },
  });
  if (rows.length < 2 || !title.trim()) return null;

  try {
    const { vector: titleVec } = await getEmbeddingsAI().generateEmbedding({
      text: title.slice(0, 500),
    });
    const sims = rows.map((r) => cosineSimilarity(titleVec, parseJson<number[]>(r.vector, [])));
    const covered = sims.filter((s) => s >= 0.55).length;
    const ratio = covered / sims.length;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  } catch {
    return null;
  }
}
