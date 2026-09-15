/**
 * Tiny fetch wrapper used by client components. Throws on non-2xx.
 */

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
  }
}

function apiAuthHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_GEO_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...apiAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, options?: { signal?: AbortSignal }) => request<T>(path, { method: 'POST', body: JSON.stringify(body), signal: options?.signal }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
