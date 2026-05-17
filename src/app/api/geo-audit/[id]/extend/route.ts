/**
 * POST /api/geo-audit/:id/extend — crawl additional pages and re-score an audit
 */

import { z } from 'zod';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  pageUrls: z.array(z.string().min(3)).min(1).max(50),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob('geo-audit.extend', {
    auditId: id,
    pageUrls: parsed.data.pageUrls,
  });
}
