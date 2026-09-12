import { config } from '@shared/config';
import type { MarketCountry } from '../market-country';
import type { SearchHit } from '../search-engine';
import { isXiaohongshuNoteUrl } from '../cross-platform-posts';
import { runCli } from './cli-runner';
import { parseXhsSearchOutput } from './parse-xhs';

const XHS_SEARCH_LIMIT = 15;
const XHS_RATE_DELAY_MS = 2500;

function buildXhsQuery(brand: string, keywords: string[], market?: MarketCountry | null): string {
  const parts = [brand, ...keywords.slice(0, 4)];
  if (market?.queryHint) parts.push(market.queryHint);
  return parts.filter(Boolean).join(' ').trim();
}

function xhsNoteToHit(note: { title: string; url: string }): SearchHit | null {
  if (!isXiaohongshuNoteUrl(note.url)) return null;
  return {
    url: note.url,
    title: note.title,
    engine: 'xhs-cli',
  };
}

export async function searchXiaohongshuViaCli(input: {
  brand: string;
  keywords: string[];
  market?: MarketCountry | null;
}): Promise<{ hits: SearchHit[]; query: string }> {
  const query = buildXhsQuery(input.brand, input.keywords, input.market);
  const command = config.presenceProbe.xhsCli;
  const timeoutMs = config.presenceProbe.agentReachTimeoutMs;

  await new Promise((r) => setTimeout(r, XHS_RATE_DELAY_MS));

  const result = await runCli(command, ['search', query, '--json'], timeoutMs);

  if (result.timedOut || result.exitCode !== 0) {
    return { hits: [], query: `xhs:${query}` };
  }

  const notes = parseXhsSearchOutput(result.stdout);
  const hits: SearchHit[] = [];
  for (const note of notes) {
    const hit = xhsNoteToHit(note);
    if (hit) hits.push(hit);
    if (hits.length >= XHS_SEARCH_LIMIT) break;
  }

  return { hits, query: `xhs:${query}` };
}
