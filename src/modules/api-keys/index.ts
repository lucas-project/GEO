/**
 * API keys — BYOK storage stub (wire to Prisma ApiKey model in a later phase).
 */

import { prisma } from '@shared/database/client';

export const apiKeysService = {
  async listForOwner(ownerId: string) {
    return prisma.apiKey.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
  },
};
