/**
 * GET /api/geo-audit/[id]/similar-chunks?q=… — semantic retrieval over stored chunk embeddings.
 */

import { NextResponse } from 'next/server';
import { getAudit } from '@modules/geo-audit/server';
import { findSimilarChunks } from '@modules/embeddings';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ error: 'q query parameter is required' }, { status: 400 });
  }

  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ error: 'audit not found' }, { status: 404 });

  try {
    const chunks = await findSimilarChunks(id, q, 12);
    return NextResponse.json({ auditId: id, query: q, chunks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
