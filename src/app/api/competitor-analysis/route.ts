/**
 * POST /api/competitor-analysis — enqueue a comparison job
 * GET  /api/competitor-analysis  — list recent comparisons
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentComparisons } from '@modules/competitor-analysis';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  targetUrl: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
  competitorUrls: z
    .array(z.string().min(3))
    .min(1)
    .max(5)
    .transform((urls) => urls.map((u) => normalizeWebsiteUrl(u.trim()))),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob('competitor.compare', parsed.data);
}

export async function GET() {
  const comparisons = await listRecentComparisons(30);
  return NextResponse.json({ comparisons });
}
