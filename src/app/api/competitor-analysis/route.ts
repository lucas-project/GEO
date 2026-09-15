/**
 * POST /api/competitor-analysis — enqueue a comparison job
 * GET  /api/competitor-analysis  — list recent comparisons
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentComparisons } from '@modules/competitor-analysis';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';
import { authenticationRequired, getRequestOwnerId, getRequestSession, workspaceWriteRequired } from '@/lib/owner-scope';

const RequestSchema = z.object({
  targetUrl: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
  competitorUrls: z
    .array(z.string().min(3))
    .min(1)
    .max(5)
    .transform((urls) => urls.map((u) => normalizeWebsiteUrl(u.trim()))),
});

export async function POST(req: Request) {
  const session = await getRequestSession();
  if (!session) return authenticationRequired();
  const denied = workspaceWriteRequired(session);
  if (denied) return denied;
  const ownerId = session.ownerId;
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob(req, 'competitor.compare', { ...parsed.data, ownerId });
}

export async function GET() {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const comparisons = await listRecentComparisons(30, ownerId);
  return NextResponse.json({ comparisons });
}
