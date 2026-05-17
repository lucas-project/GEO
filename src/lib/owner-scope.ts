/**
 * Request-scoped owner id for multi-tenant-ready API filtering.
 */

import { authService } from '@modules/auth';
import { prisma } from '@shared/database/client';

export function getRequestOwnerId(): string {
  return authService.getSession().ownerId;
}

/** Returns null if the site does not exist or belongs to another owner. */
export async function assertSiteOwnedBy(
  siteId: string,
  ownerId: string = getRequestOwnerId(),
): Promise<{ id: string; url: string } | null> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId },
    select: { id: true, url: true },
  });
  return site;
}
