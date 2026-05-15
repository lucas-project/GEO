/**
 * GET /api/geo-audit/:id — fetch a complete audit report
 */

import { NextResponse } from 'next/server';
import { getAudit } from '@modules/geo-audit';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ audit });
}
