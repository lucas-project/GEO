/**
 * POST /api/agent/run — enqueue execution of an existing plan.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enqueueAgentRun } from '@modules/geo-agent';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const Schema = z.object({ planId: z.string().min(1) });

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(Schema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  try {
    const jobId = await enqueueAgentRun(parsed.data.planId);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
