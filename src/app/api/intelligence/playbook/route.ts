/**
 * GET /api/intelligence/playbook?issueKey=...
 */

import { NextResponse } from 'next/server';
import { getPlaybook } from '@modules/intelligence';

export async function GET(req: Request) {
  const issueKey = new URL(req.url).searchParams.get('issueKey');
  if (!issueKey) {
    return NextResponse.json({ error: 'issueKey required' }, { status: 400 });
  }
  const playbook = await getPlaybook(issueKey);
  if (!playbook) {
    return NextResponse.json({ error: 'No playbook data for this issue yet' }, { status: 404 });
  }
  return NextResponse.json({ playbook });
}
