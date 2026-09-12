/**
 * POST /api/monitor/run — enqueue an immediate monitoring run.
 * Body: { siteId } or {} for a full sweep.
 */

import { z } from 'zod';
import { enqueueJob, parseJsonBodyOrFallback, parseZod } from '@/lib/api-route';

const Schema = z.object({ siteId: z.string().optional() });

export async function POST(req: Request) {
  const { body } = await parseJsonBodyOrFallback(req, {});
  const parsed = parseZod(Schema, body);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.siteId) {
    return enqueueJob(req, 'monitoring.run', { siteId: parsed.data.siteId });
  }
  return enqueueJob(req, 'monitoring.sweep', {});
}
