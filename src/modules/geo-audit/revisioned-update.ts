import 'server-only';

import { prisma } from '@shared/database/client';

const MAX_RETRIES = 4;

export interface RevisionedAuditRow {
  id: string;
  url: string;
  revision: number;
  dimensions: string;
  scoringMeta: string;
}

export type AuditJsonPatch = Pick<RevisionedAuditRow, 'dimensions' | 'scoringMeta'>;

export interface AuditReportPatch extends AuditJsonPatch {
  overallScore: number;
  narrative: string | null;
  topIssues: string;
  topFixes: string;
  screenshotUrl: string | null;
  status: string;
  scoreVersion: string;
  coverage: number | null;
  sampleManifest: string;
  pageInventory: string;
}

const ATTACHMENT_KEYS = [
  'offSitePresenceReport', 'offSitePresenceScannedAt', 'simulationVisibilityCheck',
  'simulationVisibilityHistory', 'simulationRunCount', 'suggestedSimulationPrompts',
  'suggestedCompetitors',
] as const;

function mergeAttachments(currentJson: string, computedJson: string): string {
  try {
    const current = JSON.parse(currentJson) as Record<string, unknown>;
    const computed = JSON.parse(computedJson) as Record<string, unknown>;
    const attachments = Object.fromEntries(
      ATTACHMENT_KEYS.flatMap((key) => current[key] === undefined ? [] : [[key, current[key]]]),
    );
    return JSON.stringify({ ...computed, ...attachments });
  } catch {
    return computedJson;
  }
}

/**
 * Compare-and-set update for the JSON fields shared by asynchronous audit
 * enrichments. The callback is re-run from the latest row after a conflict,
 * so independent attachments (presence scans and simulations) are retained.
 */
export async function updateAuditJsonWithRevision(
  auditId: string,
  mutate: (row: RevisionedAuditRow) => AuditJsonPatch | Promise<AuditJsonPatch>,
): Promise<number> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const rows = await prisma.$queryRawUnsafe<RevisionedAuditRow[]>(
      `SELECT "id", "url", "revision", "dimensions", "scoringMeta" FROM "GeoAudit" WHERE "id" = ?`,
      auditId,
    );
    const current = rows[0];
    if (!current) throw new Error(`Audit not found: ${auditId}`);

    const next = await mutate(current);
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE "GeoAudit"
       SET "dimensions" = ?, "scoringMeta" = ?, "revision" = "revision" + 1, "recomputedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "revision" = ?`,
      next.dimensions,
      next.scoringMeta,
      auditId,
      current.revision,
    );
    if (changed === 1) return current.revision + 1;
  }
  throw new Error(`Audit ${auditId} changed repeatedly; could not save a consistent update`);
}

/** Atomically publish every report field derived from one recomputation. */
export async function commitAuditReportWithRevision(
  auditId: string,
  patch: AuditReportPatch,
): Promise<number> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const rows = await prisma.$queryRawUnsafe<Array<Pick<RevisionedAuditRow, 'revision' | 'scoringMeta'>>>(
      `SELECT "revision", "scoringMeta" FROM "GeoAudit" WHERE "id" = ?`, auditId,
    );
    const current = rows[0];
    if (!current) throw new Error(`Audit not found: ${auditId}`);
    const scoringMeta = mergeAttachments(current.scoringMeta, patch.scoringMeta);
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE "GeoAudit" SET
        "overallScore" = ?, "dimensions" = ?, "scoringMeta" = ?, "narrative" = ?, "topIssues" = ?, "topFixes" = ?,
        "screenshotUrl" = ?, "status" = ?, "scoreVersion" = ?, "coverage" = ?, "sampleManifest" = ?, "pageInventory" = ?,
        "revision" = "revision" + 1, "recomputedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "revision" = ?`,
      patch.overallScore, patch.dimensions, scoringMeta, patch.narrative, patch.topIssues, patch.topFixes,
      patch.screenshotUrl, patch.status, patch.scoreVersion, patch.coverage, patch.sampleManifest, patch.pageInventory,
      auditId, current.revision,
    );
    if (changed === 1) return current.revision + 1;
  }
  throw new Error(`Audit ${auditId} changed repeatedly; could not publish a consistent report`);
}
