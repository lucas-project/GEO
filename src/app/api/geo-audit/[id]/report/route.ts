import { NextResponse } from 'next/server';
import { prisma } from '@shared/database/client';
import { REF_TIER_LABELS } from '@modules/geo-audit/ref-category-scores';
import { DIMENSION_LABELS, ScoringMetaSchema } from '@modules/geo-audit/schemas';
import { decayedScore } from '@/lib/audit-time-decay';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const audit = await prisma.geoAudit.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      overallScore: true,
      narrative: true,
      dimensions: true,
      scoringMeta: true,
      createdAt: true,
    },
  });

  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  const meta = audit.scoringMeta
    ? ScoringMetaSchema.safeParse(JSON.parse(audit.scoringMeta)).data
    : null;
  const dimensions = JSON.parse(audit.dimensions) as Record<
    string,
    { score: number; reasons: string[] }
  >;
  const effectiveScore = decayedScore(audit.overallScore, audit.createdAt);

  const lines: string[] = [
    'GEO Audit Report',
    '================',
    '',
    `URL: ${audit.url}`,
    `Audit ID: ${audit.id}`,
    `Created: ${audit.createdAt.toISOString()}`,
    '',
    `Overall score: ${audit.overallScore}/100`,
    `Time-adjusted score: ${effectiveScore}/100`,
    '',
  ];

  if (meta?.refCategories) {
    lines.push(
      `Ref score: ${meta.refCategories.refScore1000}/1000 (${REF_TIER_LABELS[meta.refCategories.tier]})`,
      '',
      'Category scores (A–E):',
      `  Content extractability: ${meta.refCategories.contentExtractability}`,
      `  Fact authority: ${meta.refCategories.factAuthority}`,
      `  Technical discoverability: ${meta.refCategories.technicalDiscoverability}`,
      `  Entity consistency: ${meta.refCategories.entityConsistency}`,
      `  Commercial conversion: ${meta.refCategories.commercialConversion}`,
      '',
    );
  }

  if (meta?.shareOfModel != null) {
    lines.push(`Share of Model: ${Math.round(meta.shareOfModel * 100)}%`, '');
  }

  lines.push('Dimensions:');
  for (const [dim, data] of Object.entries(dimensions)) {
    const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS] ?? dim;
    lines.push(`  ${label}: ${data.score}`);
  }

  if (meta?.layerEvidence?.presence) {
    const pe = meta.layerEvidence.presence;
    lines.push('', 'Off-site presence (methodology)', '-----------------------------', pe.methodology, '');
    if (pe.pagesAudited?.length) {
      lines.push('Pages analyzed:', ...pe.pagesAudited.map((p) => `  ${p}`), '');
    }
    if (pe.crawlFindings.length) {
      lines.push('On your site:');
      for (const f of pe.crawlFindings) {
        lines.push(`  - ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
      }
      lines.push('');
    }
    if (pe.searchQueries?.length) {
      lines.push('Search queries:');
      for (const sq of pe.searchQueries) {
        lines.push(`  ${sq.query} (${sq.resultCount} results)`);
        for (const hit of sq.topHits.slice(0, 3)) {
          lines.push(`    ${hit.link}`);
          if (hit.snippet) lines.push(`      ${hit.snippet.slice(0, 120)}`);
        }
      }
      lines.push('');
    }
    if (pe.scoreFactors.length) {
      lines.push('Why this score:');
      for (const f of pe.scoreFactors) lines.push(`  - ${f}`);
      lines.push('');
    }
  }

  if (audit.narrative) {
    lines.push('', 'Executive summary', '-----------------', audit.narrative);
  }

  const body = lines.join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="geo-audit-${id}.txt"`,
    },
  });
}
