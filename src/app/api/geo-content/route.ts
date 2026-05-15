/**
 * POST /api/geo-content — generate topic-grounded GEO content from latest audit + extraction
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateGeoContentPack } from '@modules/geo-content';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const BodySchema = z
  .object({
    url: z.string().min(2).optional(),
    auditId: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.url?.trim()) || Boolean(v.auditId?.trim()), {
    message: 'Provide a website URL or an audit ID',
  });

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(BodySchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const url = parsed.data.url?.trim() ? normalizeWebsiteUrl(parsed.data.url.trim()) : undefined;
  const auditId = parsed.data.auditId?.trim() || undefined;

  try {
    const result = await generateGeoContentPack({ url, auditId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('No completed') || message.includes('no extraction') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
