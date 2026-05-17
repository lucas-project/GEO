/**
 * POST /api/geo-audit/discover — discover site pages before running an audit
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { discoverAuditPages } from '@modules/geo-audit/server';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  url: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const result = await discoverAuditPages(parsed.data.url);
  return NextResponse.json(result);
}
