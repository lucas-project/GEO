/**
 * POST /api/geo-audit — enqueue an audit job
 * GET  /api/geo-audit  — list recent audits
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentAudits, listRecentAuditSiteGroups, findLatestCompletedAuditForUrl } from '@modules/geo-audit/server';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';
import { validateSafeUrl } from '@shared/network/safe-fetch';
import { authenticationRequired, getRequestOwnerId, getRequestSession, workspaceWriteRequired } from '@/lib/owner-scope';

const SafeWebsiteUrl = z.string().min(3).transform((value, context) => {
  const url = normalizeWebsiteUrl(value.trim());
  try {
    validateSafeUrl(url);
    return url;
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Unsafe website URL',
    });
    return z.NEVER;
  }
});

const PageRankingSchema = z.object({
  url: z.string().min(3),
  geoScore: z.number().int().min(0).max(100),
  archetype: z
    .enum([
      'homepage',
      'faq',
      'qa',
      'glossary',
      'comparison',
      'documentation',
      'product',
      'blog',
      'content',
      'utility',
    ])
    .optional(),
  signals: z.array(z.string()).optional(),
  probed: z.boolean().optional(),
});

const RequestSchema = z.object({
  url: SafeWebsiteUrl,
  pageUrls: z.array(SafeWebsiteUrl).optional(),
  maxPages: z.number().int().min(1).max(100).optional(),
  pageRankings: z.array(PageRankingSchema).optional(),
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

  return enqueueJob(req, 'geo-audit.run', {
    url: parsed.data.url,
    ownerId,
    pageUrls: parsed.data.pageUrls,
    maxPages: parsed.data.maxPages,
    pageRankings: parsed.data.pageRankings,
  });
}

export async function GET(req: Request) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get('url')?.trim();
  if (urlParam) {
    const auditId = await findLatestCompletedAuditForUrl(
      urlParam,
      searchParams.get('auditId') ?? undefined,
      ownerId,
    );
    return NextResponse.json({ auditId });
  }

  const grouped =
    searchParams.get('grouped') === '1' || searchParams.get('grouped') === 'true';

  if (grouped) {
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get('pageSize') ?? '10', 10) || 10, 1),
      50,
    );
    const result = await listRecentAuditSiteGroups(page, pageSize, ownerId);
    return NextResponse.json(result);
  }

  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 30, 1), 100) : 30;
  const audits = await listRecentAudits(limit, ownerId);
  return NextResponse.json({ audits });
}
