/**
 * POST /api/agent/plan/:id/stop — cancel pending run or request cooperative stop.
 */

import { NextResponse } from 'next/server';
import { requestAgentStop } from '@modules/geo-agent';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await requestAgentStop(id);
    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.includes('not running')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
