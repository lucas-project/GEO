/**
 * Shared helpers for Next.js App Router API routes.
 */

import { NextResponse } from 'next/server';
import type { ZodError, ZodSchema } from 'zod';
import { config } from '@shared/config';
import { queue } from '@shared/queue';

/** Route-level auth when middleware is unavailable; mirrors src/middleware.ts. */
export function assertApiAuth(req: Request): NextResponse | null {
  const secret = config.apiSecret;
  if (!secret) return null;

  const auth = req.headers.get('authorization');
  const headerKey = req.headers.get('x-geo-api-key');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (bearer === secret || headerKey === secret) return null;

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    const body = await req.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }),
    };
  }
}

/** Parse JSON body; on failure use `fallback` (e.g. monitor sweep with empty body). */
export async function parseJsonBodyOrFallback(
  req: Request,
  fallback: unknown,
): Promise<{ ok: true; body: unknown }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: true, body: fallback };
  }
}

export function zodErrorResponse(error: ZodError): NextResponse {
  return NextResponse.json({ error: error.message }, { status: 400 });
}

export function parseZod<T>(
  schema: ZodSchema<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: zodErrorResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

export async function enqueueJobId(jobType: string, payload: unknown): Promise<string> {
  return queue.enqueue(jobType, payload);
}

export async function enqueueJob(
  req: Request,
  jobType: string,
  payload: unknown,
): Promise<NextResponse> {
  const authFail = assertApiAuth(req);
  if (authFail) return authFail;
  const jobId = await enqueueJobId(jobType, payload);
  return NextResponse.json({ jobId }, { status: 202 });
}
