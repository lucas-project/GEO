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
): Promise<{ targetVisibilityScore: number; platformHits: string[]; shareOfModel: number } | null> {
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
  let totalCitations = 0;
  let targetCitations = 0;
  for (const row of rows) {
    const citations = parseJson<CitationRow[]>(row.citations, []);
    totalCitations += citations.length;
    if (targetBrand) {
      targetCitations += citations.filter((c) =>
        (c.domain ?? '').toLowerCase().includes(targetBrand.replace(/\s+/g, '')),
      ).length;
    }
  }
  const shareOfModel =
    totalCitations > 0 ? Math.min(1, targetCitations / totalCitations) : targetVisibilityScore;

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
  return { targetVisibilityScore, platformHits: [...platformHits], shareOfModel };
}

export async function getLatestCitationVisibility(siteId: string): Promise<number | null> {
  const snap = await getLatestCitationSnapshot(siteId);
  return snap?.targetVisibilityScore ?? null;
}

export async function getLatestCitationSnapshot(
  siteId: string,
): Promise<{ targetVisibilityScore: number; shareOfModel: number } | null> {
  const snap = await prisma.citationSnapshot.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    select: { targetVisibilityScore: true, citedDomains: true },
  });
  if (!snap) return null;
  const domains = parseJson<string[]>(snap.citedDomains, []);
  const shareOfModel =
    domains.length > 0
      ? Math.min(1, snap.targetVisibilityScore)
      : snap.targetVisibilityScore;
  return { targetVisibilityScore: snap.targetVisibilityScore, shareOfModel };
}

/** Historical AI citation visibility (0–100) from monitor simulation snapshots. */
export async function getCitationVisibilityTrend(siteId: string, limit = 30): Promise<number[]> {
  const snaps = await prisma.citationSnapshot.findMany({
    where: { siteId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { targetVisibilityScore: true },
  });
  return snaps.map((s) => Math.round(s.targetVisibilityScore * 100));
}

export function parsePlatformBreakdown(json: string): PlatformBreakdown {
  return parseJson<PlatformBreakdown>(json, {});
}
