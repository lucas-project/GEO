/**
 * POST /api/cron/monitor — enqueue monitoring sweep (Vercel cron / external scheduler).
 * Secured via Authorization: Bearer CRON_SECRET or x-cron-secret header.
 */

import { NextResponse } from 'next/server';
import { config } from '@shared/config';
import { enqueueJob } from '@/lib/api-route';

function authorized(req: Request): boolean {
  const secret = config.monitoring.cronSecret;
  if (!secret) return config.env === 'development';
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-cron-secret') === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const jobId = await enqueueJob('monitoring.sweep', {});
  return NextResponse.json({ jobId, enqueued: true });
}
