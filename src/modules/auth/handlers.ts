import { NextResponse } from 'next/server';
import { AuthError, applySessionCookie, type SessionIssue } from './service';

export function sessionResponse(session: SessionIssue): NextResponse {
  const response = NextResponse.json({ authenticated: true });
  applySessionCookie(response, session);
  return response;
}

export function authFailure(error: unknown): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}
