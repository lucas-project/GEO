/**
 * POST /api/agent/plan — create a plan from a goal
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPlan } from '@modules/geo-agent';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const Schema = z.object({ goal: z.string().min(3).max(800) });

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(Schema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  try {
    const { id, plan } = await createPlan(parsed.data.goal);
    return NextResponse.json({ planId: id, plan }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
