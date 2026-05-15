/**
 * POST /api/geo-audit — enqueue an audit job
 * GET  /api/geo-audit  — list recent audits
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentAudits } from '@modules/geo-audit';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  url: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob('geo-audit.run', { url: parsed.data.url });
}

export async function GET() {
  const audits = await listRecentAudits(30);
  return NextResponse.json({ audits });
}
