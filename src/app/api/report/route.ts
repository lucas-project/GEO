/**
 * GET /api/report — bundled JSON + optional HTML export.
 *
 * Query: auditId (required), runId (simulation), format=json|html
 */

import { NextResponse } from 'next/server';
import { getAudit } from '@modules/geo-audit';
import { getSimulation } from '@modules/ai-simulation';
import { getLatestCompetitorGapsForTarget } from '@modules/competitor-analysis';
import { reportingService } from '@modules/reporting';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auditId = url.searchParams.get('auditId');
  const runId = url.searchParams.get('runId');
  const format = url.searchParams.get('format') ?? 'json';

  if (!auditId) {
    return NextResponse.json({ error: 'auditId query parameter is required' }, { status: 400 });
  }

  const audit = await getAudit(auditId);
  if (!audit) return NextResponse.json({ error: 'audit not found' }, { status: 404 });

  const simulation = runId ? await getSimulation(runId) : null;
  const competitorGaps = await getLatestCompetitorGapsForTarget(audit.url, 10);
  const bundle = await reportingService.assembleBundle({
    audit,
    simulation,
    competitorGaps,
  });

  if (format === 'html') {
    const html = reportingService.bundleToHtml(bundle);
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.json({ bundle });
}
