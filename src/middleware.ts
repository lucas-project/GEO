import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * When GEO_API_SECRET is set, all `/api/*` routes require:
 *   `Authorization: Bearer <secret>` or `x-geo-api-key: <secret>`
 */
export function middleware(req: NextRequest) {
  const secret = process.env.GEO_API_SECRET;
  if (!secret) return NextResponse.next();
  if (!req.nextUrl.pathname.startsWith('/api')) return NextResponse.next();

  const auth = req.headers.get('authorization');
  const headerKey = req.headers.get('x-geo-api-key');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (bearer === secret || headerKey === secret) return NextResponse.next();

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export const config = {
  matcher: ['/api/:path*'],
};
