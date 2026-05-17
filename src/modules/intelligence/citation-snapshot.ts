/**
 * Citation fingerprints from AI simulation runs.
 */

import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { logger } from '@shared/logger';

const snapLogger = logger.child({ module: 'citation-snapshot' });

export interface PlatformBreakdownEntry {
  runs: number;
  citations: number;
  brandMentions: number;
  targetCitedRuns: number;
}

export type PlatformBreakdown = Record<string, PlatformBreakdownEntry>;

interface CitationRow {
  url?: string;
  domain?: string;
  brand?: string;
}

interface BrandMentionRow {
  brand: string;
  count: number;
}

/** Ingest citation snapshot from recent AiSimulation rows for a site. */
export async function ingestCitationSnapshot(
  siteId: string,
  auditId?: string | null,
): Promise<{ targetVisibilityScore: number; platformHits: string[] } | null> {
  const rows = await prisma.aiSimulation.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  if (rows.length === 0) return null;

  const breakdown: PlatformBreakdown = {};
  const citedDomains = new Set<string>();
  let targetCitedRuns = 0;
  const platformHits = new Set<string>();
  const targetBrand = rows.find((r) => r.targetBrand)?.targetBrand?.toLowerCase() ?? null;

  for (const row of rows) {
    const platform = row.platform;
    if (!breakdown[platform]) {
      breakdown[platform] = { runs: 0, citations: 0, brandMentions: 0, targetCitedRuns: 0 };
    }
    const entry = breakdown[platform];
    entry.runs++;

    const citations = parseJson<CitationRow[]>(row.citations, []);
    entry.citations += citations.length;
    for (const c of citations) {
      if (c.domain) citedDomains.add(c.domain.replace(/^www\./, ''));
    }

    const mentions = parseJson<BrandMentionRow[]>(row.brandMentions, []);
    entry.brandMentions += mentions.reduce((s, m) => s + m.count, 0);

    let runTargetHit = false;
    if (targetBrand) {
      const brandHit = mentions.some((m) => m.brand.toLowerCase().includes(targetBrand));
      const domainHit = citations.some((c) =>
        c.domain?.toLowerCase().includes(targetBrand.replace(/\s+/g, '')),
      );
      const textHit = row.responseText.toLowerCase().includes(targetBrand);
      runTargetHit = brandHit || domainHit || textHit;
    }
    if (runTargetHit) {
      entry.targetCitedRuns++;
      targetCitedRuns++;
      platformHits.add(platform);
    }
  }

  const targetVisibilityScore = rows.length > 0 ? targetCitedRuns / rows.length : 0;

  await prisma.citationSnapshot.create({
    data: {
      siteId,
      auditId: auditId ?? null,
      platformBreakdown: stringifyJson(breakdown),
      citedDomains: stringifyJson([...citedDomains].sort()),
      targetVisibilityScore,
    },
  });

  snapLogger.debug({ siteId, targetVisibilityScore, runs: rows.length }, 'citation snapshot stored');
  return { targetVisibilityScore, platformHits: [...platformHits] };
}

export async function getLatestCitationVisibility(siteId: string): Promise<number | null> {
  const snap = await prisma.citationSnapshot.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    select: { targetVisibilityScore: true },
  });
  return snap?.targetVisibilityScore ?? null;
}

export function parsePlatformBreakdown(json: string): PlatformBreakdown {
  return parseJson<PlatformBreakdown>(json, {});
}
