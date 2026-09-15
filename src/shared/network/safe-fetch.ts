import { currentTaskBudget } from '@shared/ai/budget';
const DEFAULT_MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function ipFamily(address: string): 0 | 4 | 6 {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return 4;
  if (address.includes(':')) return 6;
  return 0;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = octets;
  return (
    octets.some(part => part < 0 || part > 255) || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = value.match(/^(?:::ffff:)([\da-f]+):([\da-f]+)$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (value.startsWith('::ffff:') && value.includes('.')) return isPrivateIpv4(value.slice(7));
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('100:') ||
    value.startsWith('100::') ||
    value.startsWith('2001:db8:') ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.')
  );
}

export function isPrivateAddress(address: string): boolean {
  const family = ipFamily(address);
  return family === 4 ? isPrivateIpv4(address) : family === 6 ? isPrivateIpv6(address) : true;
}

/** Validate a user or redirect URL before opening a server-side connection. */
export function validateSafeUrl(input: string | URL): URL {
  const url = input instanceof URL ? new URL(input.href) : new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UnsafeUrlError(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Credentials in URLs are not allowed');
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new UnsafeUrlError(`Unsupported URL port: ${url.port}`);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    (ipFamily(hostname) !== 0 && isPrivateAddress(hostname))
  ) {
    throw new UnsafeUrlError('Private or loopback host is not allowed');
  }
  return url;
}

export async function assertPublicHost(url: URL): Promise<void> {
  if (ipFamily(url.hostname) !== 0) {
    if (isPrivateAddress(url.hostname)) throw new UnsafeUrlError('Private or loopback host is not allowed');
    return;
  }
  // Keep the DNS dependency server-only; this module is also referenced by
  // the instrumentation bundle during a Next.js build.
  const { lookup } = await import(/* webpackIgnore: true */ 'node:dns/promises');
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new UnsafeUrlError(`Host resolves to a private or unavailable address: ${url.hostname}`);
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Fetch with SSRF checks on the initial URL and every redirect target. */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  let current = validateSafeUrl(input);
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const budget = currentTaskBudget();
  const signals = [AbortSignal.timeout(options.timeoutMs ?? 20000), init.signal, budget?.signal]
    .filter((signal): signal is AbortSignal => Boolean(signal));
  const signal = AbortSignal.any(signals);

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    await assertPublicHost(current);
    budget?.consume('httpRequests');
    const response = await fetch(current, { ...init, signal, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      if (!response.body) return response;
      const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new Error('Response exceeds download limit');
          chunks.push(value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      const body = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }

    const location = response.headers.get('location');
    if (!location) return response;
    await response.body?.cancel();
    if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
      throw new UnsafeUrlError('Redirects for webhook writes are not allowed');
    }
    if (redirect === maxRedirects) {
      throw new UnsafeUrlError('Too many redirects');
    }
    current = validateSafeUrl(new URL(location, current));
  }

  throw new UnsafeUrlError('Too many redirects');
}
