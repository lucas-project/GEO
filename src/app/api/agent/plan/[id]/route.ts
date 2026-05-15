/**
 * GET /api/agent/plan/:id — fetch plan + current results
 */

import { NextResponse } from 'next/server';
import { getPlan } from '@modules/geo-agent';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ plan });
}
