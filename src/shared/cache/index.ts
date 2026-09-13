/**
 * Cache abstraction.
 *
 * Modules call `cache.get(key)` / `cache.set(key, value, ttlSec)` without
 * knowing whether the backend is in-memory or Redis. Default driver is
 * in-memory so the platform boots with zero external deps.
 */

export interface Cache {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

class InMemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}

declare global {
  var __geoCache: Cache | undefined;
}

export const cache: Cache = globalThis.__geoCache ?? new InMemoryCache();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__geoCache = cache;
}
