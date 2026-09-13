/**
 * POST /api/site-keywords — detect 5–10 on-page keywords from a website URL.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
// Constant-only internal import; the public barrel intentionally stays client-safe.
// eslint-disable-next-line no-restricted-imports
import { SITE_KEYWORD_LIMITS } from '@modules/off-site-presence/detect-site-keywords';
import { fetchSiteKeywords } from '@modules/off-site-presence/server';
import { assertApiAuth, parseJsonBody, parseZod } from '@/lib/api-route';

const RequestSchema = z.object({
  siteUrl: z.string().min(3),
});

export async function POST(req: Request) {
  const auth = assertApiAuth(req);
  if (auth) return auth;

  const bodyResult = await parseJsonBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = parseZod(RequestSchema, bodyResult.body);
  if (!parsed.ok) return parsed.response;

  try {
    const keywords = await fetchSiteKeywords(parsed.data.siteUrl);
    return NextResponse.json({
      keywords,
      limits: SITE_KEYWORD_LIMITS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Keyword detection failed' },
      { status: 500 },
    );
  }
}
