/**
 * POST /api/geo-audit — enqueue an audit job
 * GET  /api/geo-audit  — list recent audits
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentAudits, listRecentAuditSiteGroups } from '@modules/geo-audit/server';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  url: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
  pageUrls: z.array(z.string().min(3)).optional(),
  maxPages: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob('geo-audit.run', {
    url: parsed.data.url,
    pageUrls: parsed.data.pageUrls,
    maxPages: parsed.data.maxPages,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const grouped =
    searchParams.get('grouped') === '1' || searchParams.get('grouped') === 'true';

  if (grouped) {
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get('pageSize') ?? '10', 10) || 10, 1),
      50,
    );
    const result = await listRecentAuditSiteGroups(page, pageSize);
    return NextResponse.json(result);
  }

  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 30, 1), 100) : 30;
  const audits = await listRecentAudits(limit);
  return NextResponse.json({ audits });
}
