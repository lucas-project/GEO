/**
 * Cross-runtime random ID helper.
 *
 * Uses the Web Crypto API (`globalThis.crypto.randomUUID`), available in
 * Node 19+, all modern browsers, and the Next.js edge runtime. Avoids
 * having to import `node:crypto` (which webpack handles inconsistently
 * across Next.js server / edge / instrumentation contexts).
 */

export function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for ancient runtimes — extremely unlikely in production.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
