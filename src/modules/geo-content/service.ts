/**
 * GEO content ideas — refined keywords + one prompt section per content type.
 */

import { prisma, parseJson } from '@shared/database/client';
import { logger } from '@shared/logger';
import { ai } from '@shared/ai';
import { normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';
import { GeoContentPackSchema, type GeoContentPack } from './schemas';
import {
  extractRelevantKeywords,
  parseChunkTexts,
  parseFaqQuestions,
  parseHeadingTexts,
  parseTableTexts,
  type GeoContentKeyword,
} from './keywords';
import { finalizeContentPack } from './idea-matrix';
import { resolveGeoContentModel } from './model';
import { GEO_CONTENT_SYSTEM, buildGeoContentPrompt, keywordsForIdeas, packFromFallback } from './prompts';
import { refineKeywordsWithModel } from './refine-keywords';

const log = logger.child({ module: 'geo-content' });

export interface GenerateGeoContentInput {
  url?: string;
  auditId?: string;
}

export interface GenerateGeoContentResult {
  auditId: string;
  url: string;
  keywords: GeoContentKeyword[];
  pack: GeoContentPack;
}

async function resolveAudit(input: GenerateGeoContentInput) {
  if (input.auditId?.trim()) {
    return prisma.geoAudit.findFirst({
      where: { id: input.auditId.trim(), status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (input.url?.trim()) {
    const url = normalizeWebsiteUrl(input.url.trim());
    return prisma.geoAudit.findFirst({
      where: { url, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
  }
  return null;
}

function pickTargetExtraction(
  auditId: string,
  targetUrl: string,
): Promise<{ id: string; metadata: string; headings: string; faqs: string; chunks: string; tables: string; url: string } | null> {
  return prisma.extractionResult
    .findMany({ where: { auditId }, orderBy: { createdAt: 'asc' } })
    .then((rows) => rows.find((r) => sameTargetSite(r.url, targetUrl)) ?? rows[0] ?? null);
}

export async function generateGeoContentPack(input: GenerateGeoContentInput): Promise<GenerateGeoContentResult> {
  const requestedUrl = input.url?.trim() ? normalizeWebsiteUrl(input.url.trim()) : undefined;
  const audit = await resolveAudit(input);
  if (!audit) {
    throw new Error(
      'No completed GEO audit found. Run a GEO Audit for this URL first (Phase 1), then generate content here.',
    );
  }

  if (requestedUrl && !sameTargetSite(audit.url, requestedUrl)) {
    throw new Error(
      `The latest audit is for a different site (${audit.url}). Run a GEO Audit for ${requestedUrl} first.`,
    );
  }

  const targetUrl = requestedUrl ?? audit.url;
  const extraction = await pickTargetExtraction(audit.id, targetUrl);
  if (!extraction) {
    throw new Error('This audit has no extraction data yet. Re-run the audit or pick another audit.');
  }

  if (!sameTargetSite(extraction.url, targetUrl)) {
    throw new Error('No page extraction found for the target website URL on this audit.');
  }

  const metadata = parseJson<{ title?: string; description?: string }>(extraction.metadata, {});
  const title = metadata.title ?? '';
  const description = metadata.description ?? '';
  const headings = parseHeadingTexts(parseJson<unknown[]>(extraction.headings, []));
  const faqQuestions = parseFaqQuestions(parseJson<unknown[]>(extraction.faqs, []));
  const chunkTexts = parseChunkTexts(parseJson<unknown[]>(extraction.chunks, []));
  const tableTexts = parseTableTexts(parseJson<unknown[]>(extraction.tables, []));

  const candidates = extractRelevantKeywords({
    title,
    description,
    headings,
    faqQuestions,
    chunkTexts,
    tableTexts,
  });

  const keywords = await refineKeywordsWithModel({
    candidates,
    title,
    description,
    headings,
  });

  if (keywords.length === 0) {
    throw new Error(
      'No on-page keywords found for this website. Re-run the GEO audit or try a page with more headings and body text.',
    );
  }

  const keywordTerms = keywordsForIdeas(keywords).map((k) => k.term);

  const prompt = buildGeoContentPrompt({
    url: targetUrl,
    title,
    description,
    headings,
    keywords,
  });

  let pack: GeoContentPack;
  try {
    const contentModel = resolveGeoContentModel(ai.name);
    const { data } = await ai.generateStructuredOutput({
      schema: GeoContentPackSchema,
      schemaName: 'GeoContentPack',
      system: GEO_CONTENT_SYSTEM,
      prompt,
      temperature: 0.5,
      ...(contentModel ? { model: contentModel } : {}),
    });
    pack = finalizeContentPack(GeoContentPackSchema.parse(data), keywordTerms);
    pack = {
      ...pack,
      sections: pack.sections.map((s) => ({
        ...s,
        prompts: s.prompts.map((p) => p.split(/\n\n/)[0]?.trim() ?? p).filter((p) => p.length >= 4),
      })),
    };
  } catch (err) {
    log.warn({ err: (err as Error).message, auditId: audit.id }, 'structured GEO content failed; using fallback pack');
    pack = packFromFallback({ url: targetUrl, title, keywords });
  }

  log.info(
    { auditId: audit.id, targetUrl, keywords: keywords.length, sections: pack.sections.length },
    'geo content pack generated',
  );
  return { auditId: audit.id, url: targetUrl, keywords, pack };
}

export const geoContentService = {
  generateGeoContentPack,
};
