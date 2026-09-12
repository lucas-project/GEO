/**
 * POST /api/geo-content — enqueue GEO content idea generation (async job).
 */

import { z } from 'zod';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

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

  return enqueueJob(req, 'geo-content.generate', {
    url: parsed.data.url?.trim() || undefined,
    auditId: parsed.data.auditId?.trim() || undefined,
  });
}
