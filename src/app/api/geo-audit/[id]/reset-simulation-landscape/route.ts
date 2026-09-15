/**
 * POST /api/geo-audit/[id]/reset-simulation-landscape — clear batch brand/domain leaderboards
 */

import { NextResponse } from 'next/server';
import { getAudit, resetSimulationMarketLandscape } from '@modules/geo-audit/server';
import { authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { id } = await ctx.params;
  if (!(await getAudit(id, ownerId))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  try {
    await resetSimulationMarketLandscape(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reset failed';
    const status = message.includes('not found') ? 404 : message.includes('No visibility') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
