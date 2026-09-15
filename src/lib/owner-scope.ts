/**
 * Request-scoped owner id for multi-tenant-ready API filtering.
 */

import { authService, type AuthSession } from '@modules/auth';
import { prisma } from '@shared/database/client';
import { NextResponse } from 'next/server';

export async function getRequestOwnerId(): Promise<string | null> {
  return (await getRequestSession())?.ownerId ?? null;
}

export async function getRequestSession(): Promise<AuthSession | null> {
  return authService.getSession();
}

export function authenticationRequired(): NextResponse {
  return NextResponse.json({ error: 'authentication required' }, { status: 401 });
}

export function workspaceWriteRequired(session: AuthSession | null): NextResponse | null {
  if (!session) return authenticationRequired();
  if (session.role === 'viewer') return NextResponse.json({ error: 'editor or owner role required' }, { status: 403 });
  return null;
}

/** Returns null if the site does not exist or belongs to another owner. */
export async function assertSiteOwnedBy(
  siteId: string,
  ownerId?: string | null,
): Promise<{ id: string; url: string } | null> {
  const scopedOwnerId = ownerId ?? (await getRequestOwnerId());
  if (!scopedOwnerId) return null;
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: scopedOwnerId },
    select: { id: true, url: true },
  });
  return site;
}
