/**
 * POST /api/geo-audit/:id/suggest-rewrite
 * On-demand AI refinement for a highlighted snippet.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAudit } from '@modules/geo-audit/server';
import { generateHighlightRewrite } from '@modules/optimization/generators/highlight-rewrite';
import { resolveRewriteHeading } from '@modules/optimization/generators/rewrite-heading';
import type { Dimension } from '@modules/geo-audit';

const BodySchema = z.object({
  pageUrl: z.string().max(2000).optional(),
  highlightLabel: z.string().max(200),
  content: z.string().max(8000),
  heading: z.string().max(300).optional(),
  dimension: z.string(),
  problem: z.string().max(4000).optional(),
  fixHint: z.string().max(4000).optional(),
  /** 0 = first rewrite; higher values request alternate wordings (mock mode cycles templates). */
  variantIndex: z.number().int().min(0).max(20).optional(),
});

const MAX_PER_AUDIT_WINDOW_MS = 60_000;
const MAX_PER_AUDIT = 20;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(auditId: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(auditId);
  if (!entry || now > entry.resetAt) {
    rateMap.set(auditId, { count: 1, resetAt: now + MAX_PER_AUDIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_PER_AUDIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const audit = await getAudit(id);
  if (!audit) {
    return NextResponse.json({ error: 'audit not found' }, { status: 404 });
  }

  if (!checkRate(id)) {
    return NextResponse.json({ error: 'rate limit exceeded for this audit' }, { status: 429 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  const dim = body.dimension as Dimension;
  const heading = resolveRewriteHeading({
    heading: body.heading,
    highlightLabel: body.highlightLabel,
  });

  const variantIndex = body.variantIndex ?? 0;
  const { rewritten, rationale } = await generateHighlightRewrite({
    title: heading ?? 'Page section',
    heading,
    highlightLabel: body.highlightLabel,
    variantIndex,
    dimension: dim,
    firstChunk: body.content.slice(0, 4000),
    problem: body.problem,
    fixHint: body.fixHint,
  });

  return NextResponse.json({
    suggestedExample: rewritten,
    rationale,
  });
}
