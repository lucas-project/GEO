/**
 * POST /api/agent/plan/:id/replan — rebuild steps from the stored goal.
 */

import { NextResponse } from 'next/server';
import { replanFromGoal } from '@modules/geo-agent';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const plan = await replanFromGoal(id);
    return NextResponse.json({ planId: id, plan });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
