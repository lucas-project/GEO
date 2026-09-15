import { randomUUID } from 'node:crypto';
import { prisma, parseJson, stringifyJson } from '@shared/database/client';
import { SiteProfileSchema, type SiteProfile } from '@modules/extraction';
import { z } from 'zod';

export const ConfirmProfileSchema = z.object({
  siteId: z.string().min(1), expectedVersion: z.string().nullable(),
  profile: SiteProfileSchema,
});
export async function readSiteProfile(siteId: string, ownerId = 'local') {
  const site = await prisma.site.findFirst({ where: { id: siteId, ownerId } });
  if (!site) throw new Error('Site not found');
  const parsed = SiteProfileSchema.safeParse(parseJson(site.profile ?? '{}', {}));
  return { siteId, profile: parsed.success ? parsed.data : null, version: site.profileVersion,
    confirmedAt: site.profileConfirmedAt?.toISOString() ?? null };
}
export async function confirmedProfileForUrl(url: string, ownerId = 'local') {
  const site = await prisma.site.findFirst({ where: { ownerId, url: { in: [url, url.replace(/\/$/, ''), `${url.replace(/\/$/, '')}/`] }, profileConfirmedAt: { not: null } } });
  const parsed = SiteProfileSchema.safeParse(parseJson(site?.profile ?? '{}', {}));
  return parsed.success ? parsed.data : null;
}
export const UserEvidenceSchema = z.object({ siteId: z.string().min(1), url: z.string().url(), excerpt: z.string().trim().min(1).max(2000) });
export async function addUserEvidence(input: z.infer<typeof UserEvidenceSchema>, ownerId = 'local') {
  const evidence = { id: randomUUID(), requestedUrl: input.url, finalUrl: input.url,
    excerpt: input.excerpt, method: 'user_supplied', verification: 'unverified', capturedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 4; attempt++) {
    const site = await prisma.site.findFirst({ where: { id: input.siteId, ownerId } });
    if (!site) throw new Error('Site not found');
    const items = parseJson<unknown[]>(site.userEvidence, []);
    if (items.length >= 100) throw new Error('Evidence limit reached (100 items per site)');
    const result = await prisma.site.updateMany({ where: { id: site.id, userEvidence: site.userEvidence },
      data: { userEvidence: stringifyJson([...items, evidence]) } });
    if (result.count) return evidence;
  }
  throw new Error('Evidence changed concurrently. Retry.');
}
export async function readUserEvidence(siteId: string, ownerId = 'local') {
  const site = await prisma.site.findFirst({ where: { id: siteId, ownerId } });
  if (!site) throw new Error('Site not found');
  return parseJson<unknown[]>(site.userEvidence, []);
}
export async function confirmSiteProfile(input: z.infer<typeof ConfirmProfileSchema>, ownerId = 'local') {
  const version = `confirmed-${randomUUID()}`;
  const profile: SiteProfile = { ...input.profile, version, confirmationState: 'confirmed' };
  const saved = await prisma.site.updateMany({
    where: { id: input.siteId, ownerId, profileVersion: input.expectedVersion },
    data: { profile: stringifyJson(profile), profileVersion: version,
      profileConfirmedAt: new Date(), profileConfirmedBy: ownerId },
  });
  if (saved.count !== 1) throw new Error('Profile changed. Reload before confirming.');
  return readSiteProfile(input.siteId, ownerId);
}
