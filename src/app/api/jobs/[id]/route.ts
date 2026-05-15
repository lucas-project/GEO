/**
 * GET /api/jobs/:id — poll job status (used by all phases)
 */

import { NextResponse } from 'next/server';
import { queue } from '@shared/queue';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await queue.getJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ job });
}
