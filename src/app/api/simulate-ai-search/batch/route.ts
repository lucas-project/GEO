/**
 * POST /api/simulate-ai-search/batch — run all suggested prompts in one job
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getCapabilityAvailability } from '@shared/ai';
import { assertApiAuth, enqueueJob, parseJsonBody, parseZod } from '@/lib/api-route';

const PromptEntrySchema = z.object({
  text: z.string().min(3).max(800),
  type: z.enum(['brand', 'discovery']).optional(),
});

const RequestSchema = z.object({
  prompts: z
    .union([z.array(z.string().min(3).max(800)), z.array(PromptEntrySchema)])
    .transform((items) =>
      items.map((item) =>
        typeof item === 'string' ? { text: item } : item,
      ),
    )
    .pipe(z.array(PromptEntrySchema).min(1).max(10)),
  targetBrand: z.string().optional(),
  targetUrl: z.string().optional(),
  contextAuditId: z.string().optional(),
  auditId: z.string().min(1),
});

export async function POST(req: Request) {
  const authFail = assertApiAuth(req);
  if (authFail) return authFail;
  const availability = getCapabilityAvailability('simulation');
  if (!availability.available) {
    return NextResponse.json({ error: 'simulation_unavailable', availability }, { status: 409 });
  }
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  return enqueueJob(req, 'ai-simulation.batch', parsed.data);
}
