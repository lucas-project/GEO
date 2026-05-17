/**
 * GET /api/intelligence/insights?cohortKey=global|vertical:saas
 */

import { NextResponse } from 'next/server';
import { getCohortInsights } from '@modules/intelligence';

export async function GET(req: Request) {
  const cohortKey = new URL(req.url).searchParams.get('cohortKey') ?? 'global';
  const insights = await getCohortInsights(cohortKey);
  return NextResponse.json({ cohortKey, insights });
}
