/**
 * GET /api/intelligence/similar-chunks?cohortKey=global&query=...
 */

import { NextResponse } from 'next/server';
import { findSimilarCohortChunks } from '@modules/intelligence';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cohortKey = url.searchParams.get('cohortKey') ?? 'global';
  const query = url.searchParams.get('query');
  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }
  const chunks = await findSimilarCohortChunks(cohortKey, query, 8);
  return NextResponse.json({ chunks });
}
