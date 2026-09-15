import { NextResponse } from 'next/server';
import { authFailure, authService, CreateWorkspaceSchema } from '@modules/auth';
import { parseJsonBody, parseZod } from '@/lib/api-route';

export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = parseZod(CreateWorkspaceSchema, body.body);
  if (!parsed.ok) return parsed.response;
  const session = await authService.getSession();
  if (!session) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  try {
    return NextResponse.json({ workspace: await authService.createWorkspace(session, parsed.data.name) }, { status: 201 });
  } catch (error) {
    return authFailure(error);
  }
}
