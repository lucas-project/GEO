import { NextResponse } from 'next/server';
import { authService, clearSessionCookie } from '@modules/auth';

export async function POST() {
  await authService.logout();
  const response = NextResponse.json({ authenticated: false });
  clearSessionCookie(response);
  return response;
}
