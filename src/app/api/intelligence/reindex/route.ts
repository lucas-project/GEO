/**
 * POST /api/intelligence/reindex — recompute cohort lift stats from all audit rollups
 */

import { NextResponse } from 'next/server';
import { reindexPatterns } from '@modules/intelligence';

export async function POST() {
  const result = await reindexPatterns();
  return NextResponse.json(result);
}
