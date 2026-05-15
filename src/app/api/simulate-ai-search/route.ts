/**
 * POST /api/simulate-ai-search — enqueue a multi-platform simulation
 * GET  /api/simulate-ai-search  — list recent simulations
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecentSimulations, getSimulation } from '@modules/ai-simulation';
import { enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  prompt: z.string().min(3).max(800),
  targetBrand: z.string().optional(),
  targetUrl: z.string().optional(),
  runsPerPlatform: z.number().int().min(1).max(3).optional(),
  contextAuditId: z.string().optional(),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob('ai-simulation.run', parsed.data);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  if (runId) {
    const result = await getSimulation(runId);
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ result });
  }
  const simulations = await listRecentSimulations(30);
  return NextResponse.json({ simulations });
}
