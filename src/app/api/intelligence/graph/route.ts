/**
 * GET /api/intelligence/graph?siteId=...
 */

import { NextResponse } from 'next/server';
import { getIntelligenceGraphSummary } from '@modules/intelligence';
import { assertSiteOwnedBy, authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

export async function GET(req: Request) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  }

  const site = await assertSiteOwnedBy(siteId, ownerId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  const graph = await getIntelligenceGraphSummary(siteId);
  return NextResponse.json(graph);
}
