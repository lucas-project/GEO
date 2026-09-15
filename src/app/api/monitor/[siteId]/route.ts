/**
 * GET /api/monitor/:siteId — monitored site detail with run history.
 */

import { NextResponse } from 'next/server';
import { getMonitoredSiteDetail } from '@modules/monitoring';
import { assertSiteOwnedBy, authenticationRequired, getRequestOwnerId } from '@/lib/owner-scope';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const { siteId } = await params;
  const site = await assertSiteOwnedBy(siteId, ownerId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  const detail = await getMonitoredSiteDetail(siteId);
  if (!detail) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  return NextResponse.json(detail);
}
