/**
 * GET    /api/monitor              — list monitored sites + recent alerts
 * POST   /api/monitor              — add a site to monitoring
 * PATCH  /api/monitor              — update schedule
 * DELETE /api/monitor?siteId=...    — remove a site
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addMonitoredSite,
  removeMonitoredSite,
  listMonitoredSites,
  listAlerts,
  updateMonitorSchedule,
} from '@modules/monitoring';
import { canonicalPageUrl } from '@/lib/website-url';
import { MonitorSchedulePresetSchema } from '@modules/monitoring/schemas';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import { getRequestOwnerId, assertSiteOwnedBy } from '@/lib/owner-scope';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const AddSchema = z.object({
  url: z.string().min(3).transform((s) => normalizeWebsiteUrl(s.trim())),
  siteId: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional().nullable(),
  monitorIntervalHours: z.number().int().min(1).max(168).optional(),
  monitorSchedulePreset: MonitorSchedulePresetSchema.optional(),
  monitorPageUrls: z.array(z.string().min(3)).optional(),
  simulationPrompts: z.array(z.string().min(3)).max(8).optional(),
});

const PatchSchema = z.object({
  siteId: z.string().min(1),
  monitorEnabled: z.boolean().optional(),
  monitorIntervalHours: z.number().int().min(1).max(168).optional(),
  monitorSchedulePreset: MonitorSchedulePresetSchema.optional(),
  monitorPageUrls: z.array(z.string().min(3)).optional(),
});

function normalizeMonitorPageUrls(urls: string[] | undefined, siteRoot: string): string[] | undefined {
  if (!urls?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const canon = canonicalPageUrl(u, siteRoot);
    if (!seen.has(canon)) {
      seen.add(canon);
      out.push(canon);
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function GET() {
  const ownerId = getRequestOwnerId();
  const [sites, alerts] = await Promise.all([
    listMonitoredSites(ownerId),
    listAlerts(40, ownerId),
  ]);
  return NextResponse.json({ sites, alerts });
}

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(AddSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const siteRoot = parsed.data.url;
  const result = await addMonitoredSite(parsed.data.url, {
    webhookUrl: parsed.data.webhookUrl,
    monitorIntervalHours: parsed.data.monitorIntervalHours,
    monitorSchedulePreset: parsed.data.monitorSchedulePreset,
    monitorPageUrls: normalizeMonitorPageUrls(parsed.data.monitorPageUrls, siteRoot),
    simulationPrompts: parsed.data.simulationPrompts,
    ownerId: getRequestOwnerId(),
  });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(PatchSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const site = await assertSiteOwnedBy(parsed.data.siteId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  const siteRoot = site.url;
  await updateMonitorSchedule(parsed.data.siteId, {
    monitorEnabled: parsed.data.monitorEnabled,
    monitorIntervalHours: parsed.data.monitorIntervalHours,
    monitorSchedulePreset: parsed.data.monitorSchedulePreset,
    monitorPageUrls: normalizeMonitorPageUrls(parsed.data.monitorPageUrls, siteRoot),
  });
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

  const site = await assertSiteOwnedBy(siteId);
  if (!site) return NextResponse.json({ error: 'site not found' }, { status: 404 });

  await removeMonitoredSite(siteId);
  return NextResponse.json({ removed: true });
}
