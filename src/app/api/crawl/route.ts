/**
 * POST /api/crawl — enqueue a robots + sitemap + Playwright crawl (no audit row).
 */

import { z } from 'zod';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  url: z.string().min(1).transform((s) => normalizeWebsiteUrl(s.trim())).pipe(z.string().url()),
  maxPages: z.number().int().min(1).max(20).optional(),
  screenshot: z.boolean().optional(),
  respectRobots: z.boolean().optional(),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob(req, 'crawl.run', parsed.data);
}
