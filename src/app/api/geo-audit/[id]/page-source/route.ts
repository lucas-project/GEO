/**
 * GET /api/geo-audit/:id/page-source?url=...
 * Lazy-load Playwright rendered HTML for an audited page.
 */

import { NextResponse } from 'next/server';
import { getAudit, getAuditPageSource } from '@modules/geo-audit/server';
import { authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { id } = await ctx.params;
  const pageUrl = new URL(req.url).searchParams.get('url');
  if (!pageUrl) {
    return NextResponse.json({ error: 'url query parameter required' }, { status: 400 });
  }
  if (!(await getAudit(id, ownerId))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const source = await getAuditPageSource(id, pageUrl);
  if (!source) {
    return NextResponse.json({ error: 'page not found for this audit' }, { status: 404 });
  }

  return NextResponse.json(source);
}
