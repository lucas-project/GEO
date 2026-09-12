/**
 * POST /api/geo-audit/[id]/reset-simulation-landscape — clear batch brand/domain leaderboards
 */

import { NextResponse } from 'next/server';
import { resetSimulationMarketLandscape } from '@modules/geo-audit/reset-simulation-landscape';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await resetSimulationMarketLandscape(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reset failed';
    const status = message.includes('not found') ? 404 : message.includes('No visibility') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
