import { NextResponse } from 'next/server';
import { prisma } from '@shared/database/client';
import { ScoringMetaSchema, type PageInventory } from '@modules/geo-audit';
import { resolveAcquisitionCopy } from '@modules/crawling';
import { getAudit } from '@modules/geo-audit/server';
import { authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

function parseInventory(raw: string | null | undefined): PageInventory | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PageInventory;
    if (parsed?.pages && Array.isArray(parsed.pages)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { id } = await params;
  if (!(await getAudit(id, ownerId))) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }
  const audit = await prisma.geoAudit.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      revision: true,
      scoreVersion: true,
      coverage: true,
      scoringMeta: true,
      status: true,
      createdAt: true,
      pageInventory: true,
    },
  });

  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  const meta = audit.scoringMeta
    ? ScoringMetaSchema.safeParse(JSON.parse(audit.scoringMeta)).data
    : null;
  const reportStatus =
    audit.status === 'partial' || meta?.completion === 'partial'
      ? 'partial'
      : audit.status === 'failed' || meta?.completion === 'failed'
        ? 'failed'
        : 'completed';

  const inventory = parseInventory(audit.pageInventory);

  const lines: string[] = [
    'GEO Audit Report',
    '================',
    '',
    `URL: ${audit.url}`,
    `Audit ID: ${audit.id}`,
    `Status: ${reportStatus}`,
    `Report revision: ${audit.revision}`,
    `Score version: ${audit.scoreVersion}`,
    `Created: ${audit.createdAt.toISOString()}`,
    '',
  ];

  if (reportStatus === 'partial') {
    lines.push('NOTE: Partial audit — results are directional; evidence may be incomplete.');
    if (meta?.stopReason) lines.push(`Stop reason: ${meta.stopReason}`);
    lines.push('');
  }

  if (meta?.requestedPages != null || meta?.auditedPages != null) {
    lines.push(
      `Page sample: ${meta?.auditedPages ?? 0}/${meta?.requestedPages ?? 0} requested pages audited` +
        (meta?.sampleCoverageStatus ? ` (${meta.sampleCoverageStatus})` : ''),
      '',
    );
  }

  lines.push('Evidence summary');
  if (meta?.readiness) {
    lines.push(
      `Content and technical checks: ${meta.readiness.score == null ? 'insufficient evidence' : `${meta.readiness.score}/100`}`,
      `Evidence coverage: ${Math.round(meta.readiness.coverage * 100)}% (${meta.readiness.coverageStatus})`,
    );
  } else {
    lines.push('This legacy report does not contain the evidence contract required for current readiness checks.');
  }
  lines.push('Overall GEO scores, citation probability, external visibility, and heuristic dimension scores are omitted because this report cannot measure those outcomes.', '');

  if (inventory?.pages?.length) {
    const failed = inventory.pages.filter(
      (p) => p.observationStatus && p.observationStatus !== 'observed',
    );
    const observed = inventory.pages.filter((p) => p.observationStatus === 'observed').length;
    lines.push(
      '',
      'Page acquisition',
      '----------------',
      `${inventory.discoveredCount} discovered · ${observed} observed · scoring uses observed pages only`,
      '',
    );
    if (failed.length) {
      lines.push('Pages with acquisition issues:');
      for (const page of failed) {
        const detail = page.acquisitionDetail;
        lines.push(`  ${page.url}`);
        lines.push(
          `    status: ${page.observationStatus}` +
            (detail?.reasonCode ? ` (${detail.reasonCode})` : ''),
        );
        const copy = resolveAcquisitionCopy({
          observationStatus: page.observationStatus,
          audited: page.audited,
        });
        lines.push(`    message: ${copy.userMessage}`);
        lines.push(`    next: ${copy.nextAction}`);
      }
      lines.push('');
      lines.push('Technical details:');
      for (const page of failed) {
        const detail = page.acquisitionDetail;
        if (!detail?.technicalMessage && detail?.elapsedMs == null) continue;
        lines.push(`  ${page.url}`);
        if (detail.stage) lines.push(`    stage: ${detail.stage}`);
        if (detail.waitCondition) lines.push(`    wait: ${detail.waitCondition}`);
        if (detail.elapsedMs != null) lines.push(`    elapsedMs: ${detail.elapsedMs}`);
        if (detail.fetchChannel) lines.push(`    channel: ${detail.fetchChannel}`);
        if (detail.httpStatus != null) lines.push(`    httpStatus: ${detail.httpStatus}`);
        if (detail.technicalMessage) lines.push(`    technical: ${detail.technicalMessage}`);
      }
      lines.push('');
    }
  }

  if (meta?.readiness?.criteria.length) {
    lines.push('Checks');
    for (const criterion of meta.readiness.criteria) {
      lines.push(`  ${criterion.criterionId}: ${criterion.outcome} (${criterion.confidenceReason})`);
    }
  }

  const body = lines.join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="geo-audit-${id}.txt"`,
    },
  });
}
