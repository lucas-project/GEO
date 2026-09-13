import { NextResponse } from 'next/server';
import { z } from 'zod';
import { disposeArtifact, recheckArtifact, readArtifactVerification } from '@modules/optimization';
import { parseJsonBody, parseZod } from '@/lib/api-route';
const schema = z.object({ optimizationId: z.string().min(1), action: z.enum(['applied','dismissed','recheck']) });
export async function POST(req: Request) {
  const body = await parseJsonBody(req); if (!body.ok) return body.response;
  const input = parseZod(schema, body.body); if (!input.ok) return input.response;
  try {
    const { optimizationId, action } = input.data;
    if (action === 'recheck') return NextResponse.json({ jobId: await recheckArtifact(optimizationId) }, { status: 202 });
    await disposeArtifact(optimizationId, action); return NextResponse.json({ disposition: action });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('optimizationId');
  if (!id) return NextResponse.json({ error: 'optimizationId required' }, { status: 400 });
  return NextResponse.json(await readArtifactVerification(id));
}
