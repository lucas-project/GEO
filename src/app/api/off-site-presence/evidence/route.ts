import { NextResponse } from 'next/server';
import { addUserEvidence, readUserEvidence, UserEvidenceSchema } from '@modules/site-profile';
import { parseJsonBody, parseZod } from '@/lib/api-route';
export async function POST(req: Request) {
  const body = await parseJsonBody(req); if (!body.ok) return body.response;
  const input = parseZod(UserEvidenceSchema, body.body); if (!input.ok) return input.response;
  try { return NextResponse.json({ evidence: await addUserEvidence(input.data) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
}
export async function GET(req: Request) {
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  try { return NextResponse.json({ evidence: await readUserEvidence(siteId) }); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
