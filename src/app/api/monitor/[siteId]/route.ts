/**
 * GET /api/monitor/:siteId — monitored site detail with run history.
 */

import { NextResponse } from 'next/server';
import { getMonitoredSiteDetail } from '@modules/monitoring';
import { assertSiteOwnedBy } from '@/lib/owner-scope';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await assertSiteOwnedBy(siteId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  const detail = await getMonitoredSiteDetail(siteId);
  if (!detail) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  return NextResponse.json(detail);
}
