/**
 * POST /api/geo-audit/[id]/enrich-suggestions — backfill AI questions & competitors
 */

import { z } from 'zod';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  questionTypes: z
    .object({
      brand: z.boolean().optional(),
      discovery: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body ?? {});
  if (!parsed.ok) return parsed.response;

  return enqueueJob(req, 'geo-audit.enrich-suggestions', {
    auditId: id,
    questionTypes: parsed.data.questionTypes,
  });
}
