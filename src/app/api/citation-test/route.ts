/**
 * POST /api/citation-test — synchronous citation extraction from supplied text.
 *
 * Useful for testing how a chunk of AI response would be parsed without
 * running a full simulation.
 */

import { z } from 'zod';
import { extractCitations } from '@modules/ai-simulation';
import { parseJsonBody, parseZod } from '@/lib/api-route';
import { NextResponse } from 'next/server';

const RequestSchema = z.object({
  text: z.string().min(10).max(8000),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  const result = await extractCitations(parsed.data.text);
  return NextResponse.json(result);
}
