/**
 * POST /api/auto-fix — synchronously generate an artifact for an audit.
 * GET  /api/auto-fix?auditId=... — list artifacts for an audit.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ARTIFACT_TYPES,
  generateArtifact,
  listArtifactsForAudit,
  applyArtifactToWordpress,
  markOptimizationApplied,
} from '@modules/optimization';
import { parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  auditId: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES),
  targetUrl: z.string().url().optional(),
  applyWordpressDraft: z.boolean().optional(),
});

export async function POST(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  try {
    const artifact = await generateArtifact(parsed.data);
    let cms: Awaited<ReturnType<typeof applyArtifactToWordpress>> | undefined;
    if (parsed.data.applyWordpressDraft && parsed.data.type === 'faq-schema') {
      cms = await applyArtifactToWordpress(parsed.data.auditId, 'faq-schema', artifact.content);
    }
    return NextResponse.json({ artifact, cms });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const MarkAppliedSchema = z.object({
  optimizationId: z.string().min(1),
});

export async function PATCH(req: Request) {
  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(MarkAppliedSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  await markOptimizationApplied(parsed.data.optimizationId);
  return NextResponse.json({ applied: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auditId = url.searchParams.get('auditId');
  if (!auditId) return NextResponse.json({ error: 'auditId query required' }, { status: 400 });
  const artifacts = await listArtifactsForAudit(auditId);
  return NextResponse.json({ artifacts });
}
