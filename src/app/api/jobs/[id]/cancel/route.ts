/**
 * POST /api/jobs/:id/cancel — cancel a pending or running job
 */

import { NextResponse } from 'next/server';
import { assertApiAuth } from '@/lib/api-route';
import { queue } from '@shared/queue';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = assertApiAuth(req);
  if (auth) return auth;

  const { id } = await ctx.params;
  const existing = await queue.getJob(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await queue.cancel(id);
  const job = await queue.getJob(id);
  return NextResponse.json({ job });
}
