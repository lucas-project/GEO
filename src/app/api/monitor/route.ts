/**
 * GET    /api/monitor              — list monitored sites + recent alerts
 * POST   /api/monitor              — add a site to monitoring
 * DELETE /api/monitor?siteId=...    — remove a site
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addMonitoredSite,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
} from '@modules/monitoring';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const AddSchema = z.object({
  url: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
  webhookUrl: z.string().url().optional().nullable(),
});

export async function GET() {
  const [sites, alerts] = await Promise.all([listMonitoredSites(), listAlerts(40)]);
  return NextResponse.json({ sites, alerts });
}

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(AddSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const result = await addMonitoredSite(parsed.data.url, {
    webhookUrl: parsed.data.webhookUrl,
  });
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  await removeMonitoredSite(siteId);
  return NextResponse.json({ removed: true });
}
