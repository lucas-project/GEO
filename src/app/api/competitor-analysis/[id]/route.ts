/**
 * GET /api/competitor-analysis/:id — full comparison payload for UI
 */

import { NextResponse } from 'next/server';
import { getComparisonRun } from '@modules/competitor-analysis';
import { authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { id } = await ctx.params;
  const comparison = await getComparisonRun(id, ownerId);
  if (!comparison) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ comparison });
}
