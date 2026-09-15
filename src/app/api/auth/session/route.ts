import { NextResponse } from 'next/server';
import { authService } from '@modules/auth';

export async function GET() {
  const session = await authService.getSession();
  return NextResponse.json(session ? { authenticated: true, session } : { authenticated: false });
}
