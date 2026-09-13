import 'server-only';

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { parseExtractionRow } from '@modules/intelligence';
import {
  DIMENSIONS,
  DimensionScoreSchema,
  ScoringMetaSchema,
  type Dimension,
  type DimensionScore,
  type ScoringMeta,
} from './schemas';
import {
  deriveSiteKeywordsFromExtraction,
  generateAuditSuggestions,
} from './suggestion-generators';
import {
  applyGeneratedSimulationPrompts,
  normalizeSimulationPrompts,
  resolveQuestionTypes,
  type SimulationQuestionTypesInput,
} from './simulation-prompts';
import { updateAuditJsonWithRevision } from './revisioned-update';

function normalizeDimensions(
  raw: Partial<Record<Dimension, DimensionScore>>,
): Record<Dimension, DimensionScore> {
  const out = {} as Record<Dimension, DimensionScore>;
  for (const d of DIMENSIONS) {
    const parsed = DimensionScoreSchema.safeParse(raw[d]);
    out[d] = parsed.success ? parsed.data : { score: 0, reasons: [] };
  }
  return out;
}

function parseScoringMeta(json: string | null | undefined): ScoringMeta | null {
  if (!json) return null;
  try {
    const parsed = ScoringMetaSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Backfill or regenerate suggestedSimulationPrompts and suggestedCompetitors. */
export async function enrichAuditSuggestions(
  auditId: string,
  options?: { questionTypes?: SimulationQuestionTypesInput },
): Promise<{ prompts: number; competitors: number }> {
  const row = await prisma.geoAudit.findUnique({
    where: { id: auditId },
    select: { url: true, dimensions: true, scoringMeta: true, status: true },
  });
  if (!row) throw new Error('Audit not found');
  if (row.status !== 'completed') throw new Error('Audit is not complete');

  const dimensions = normalizeDimensions(
    parseJson(row.dimensions, {} as Partial<Record<Dimension, DimensionScore>>),
  );
  const storedMeta = parseScoringMeta(row.scoringMeta);
  if (!storedMeta) throw new Error('Audit has no scoring metadata');

  let brandName: string;
  try {
    brandName = new URL(row.url).hostname.replace(/^www\./, '');
  } catch {
    brandName = row.url;
  }

  const extractions = await prisma.extractionResult.findMany({
    where: { auditId },
    take: 3,
    select: {
      url: true,
      metadata: true,
      headings: true,
      schemas: true,
      faqs: true,
      entities: true,
      chunks: true,
      links: true,
      tables: true,
      authors: true,
      checklist: true,
    },
  });

  let siteKeywords: string[] = [];
  if (extractions.length > 0) {
    const parsed = parseExtractionRow(extractions[0]!);
    siteKeywords = deriveSiteKeywordsFromExtraction(parsed);
  }

  const questionTypes = options?.questionTypes;
  const typesToGenerate = resolveQuestionTypes(questionTypes);

  const { prompts: generatedPrompts, competitors: suggestedCompetitors } =
    await generateAuditSuggestions({
      url: row.url,
      brandName,
      dimensions,
      siteKeywords,
      questionTypes,
    });

  const suggestedSimulationPrompts =
    typesToGenerate.length > 0
      ? applyGeneratedSimulationPrompts(generatedPrompts, typesToGenerate)
      : normalizeSimulationPrompts(storedMeta.suggestedSimulationPrompts, brandName);

  await updateAuditJsonWithRevision(auditId, (current) => {
    const latestMeta = parseScoringMeta(current.scoringMeta) ?? storedMeta;
    const mergedMeta: ScoringMeta = {
      ...latestMeta,
      ...(suggestedSimulationPrompts.length > 0 ? { suggestedSimulationPrompts } : {}),
      ...(suggestedCompetitors.length > 0
        ? { suggestedCompetitors }
        : latestMeta.suggestedCompetitors
          ? { suggestedCompetitors: latestMeta.suggestedCompetitors }
          : {}),
    };
    return { dimensions: current.dimensions, scoringMeta: stringifyJson(mergedMeta) };
  });

  return {
    prompts: suggestedSimulationPrompts.length,
    competitors: suggestedCompetitors.length,
  };
}
