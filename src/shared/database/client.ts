/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reloads can leak Prisma instances; we cache on
 * `globalThis` to avoid exhausting connections.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  var __geoPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__geoPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoPrisma = prisma;
}

/**
 * Safely parse a JSON column. Prisma stores complex objects as strings on
 * SQLite; this helper avoids `JSON.parse` boilerplate everywhere.
 */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
