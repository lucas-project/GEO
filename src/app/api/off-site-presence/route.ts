/**
 * POST /api/off-site-presence — enqueue deep off-site presence probe (Playwright + optional Serper).
 */

import { z } from 'zod';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  siteUrl: z.string().url(),
  brandOverride: z.string().min(1).max(120).optional(),
  siteKeywords: z.array(z.string().min(1).max(80)).max(10).optional(),
  auditId: z.string().min(1).optional(),
  playwrightEnabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob(req, 'off-site-presence.probe', parsed.data);
}
