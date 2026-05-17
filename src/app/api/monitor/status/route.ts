/**
 * GET /api/monitor/status?siteId=...
 */

import { NextResponse } from 'next/server';
import { getSiteMonitorStatus } from '@modules/monitoring';
import { assertSiteOwnedBy } from '@/lib/owner-scope';

export async function GET(req: Request) {
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  }

  const site = await assertSiteOwnedBy(siteId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  const status = await getSiteMonitorStatus(siteId);
  if (!status) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  return NextResponse.json(status);
}
