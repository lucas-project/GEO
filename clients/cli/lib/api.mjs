/**
 * Tiny REST client for the GEO AI OS API. No deps.
 */

const DEFAULT_BASE = process.env.GEO_API_URL || 'http://localhost:3000';

export class GeoApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const base = process.env.GEO_API_URL || DEFAULT_BASE;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message = (parsed && parsed.error) || `HTTP ${res.status}`;
    throw new GeoApiError(message, res.status);
  }
  return parsed;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  delete: (path) => request('DELETE', path),
};

export async function pollJob(jobId, { onProgress, intervalMs = 1500, timeoutMs = 5 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    const { job } = await api.get(`/api/jobs/${jobId}`);
    if (job.status !== lastStatus || onProgress) {
      onProgress?.(job);
      lastStatus = job.status;
    }
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for job');
}
