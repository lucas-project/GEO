import { NextResponse } from 'next/server';
import { readSiteProfile, confirmSiteProfile, ConfirmProfileSchema } from '@modules/site-profile';
import { parseJsonBody, parseZod } from '@/lib/api-route';
import { authenticationRequired, getRequestOwnerId, getRequestSession, workspaceWriteRequired } from '@/lib/owner-scope';
export async function GET(req: Request) {
  const ownerId = await getRequestOwnerId();
  if (!ownerId) return authenticationRequired();
  const siteId = new URL(req.url).searchParams.get('siteId');
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  try { return NextResponse.json(await readSiteProfile(siteId, ownerId)); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
export async function POST(req: Request) {
  const session = await getRequestSession();
  if (!session) return authenticationRequired();
  const denied = workspaceWriteRequired(session);
  if (denied) return denied;
  const ownerId = session.ownerId;
  const body = await parseJsonBody(req); if (!body.ok) return body.response;
  const input = parseZod(ConfirmProfileSchema, body.body); if (!input.ok) return input.response;
  try { return NextResponse.json(await confirmSiteProfile(input.data, ownerId)); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }); }
}
