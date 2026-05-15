import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseZod, zodErrorResponse } from './api-route';

describe('parseZod', () => {
  const schema = z.object({ url: z.string().min(3) });

  it('returns parsed data on success', () => {
    const result = parseZod(schema, { url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toBe('https://example.com');
    }
  });

  it('returns 400 response on failure', () => {
    const result = parseZod(schema, { url: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe('zodErrorResponse', () => {
  it('includes zod message in body', async () => {
    const parsed = z.object({ n: z.number() }).safeParse({ n: 'bad' });
    if (parsed.success) throw new Error('expected failure');
    const res = zodErrorResponse(parsed.error);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
  });
});
