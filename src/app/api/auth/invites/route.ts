import { NextResponse } from 'next/server';
import { authFailure, authService, CreateInviteSchema } from '@modules/auth';
import { parseJsonBody, parseZod } from '@/lib/api-route';

export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = parseZod(CreateInviteSchema, body.body);
  if (!parsed.ok) return parsed.response;
  const session = await authService.getSession();
  if (!session) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  try {
    const invite = await authService.createInvite(session, parsed.data);
    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    return authFailure(error);
  }
}
