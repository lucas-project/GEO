import { config } from '@shared/config';
import { isOwnDomain } from '../supplement-helpers';
import type { SearchHit } from '../search-engine';
import { runCli } from './cli-runner';
import { parseRdtSearchOutput, rdtHitsToSearchHits } from './parse-rdt';

const RDT_SEARCH_LIMIT = 15;

export async function searchRedditViaRdt(
  brand: string,
  domain: string,
  keywords: string[],
): Promise<{ hits: SearchHit[]; query: string }> {
  const query = [brand, ...keywords.slice(0, 3)].filter(Boolean).join(' ');
  const command = config.presenceProbe.rdtCli;
  const timeoutMs = config.presenceProbe.agentReachTimeoutMs;

  const result = await runCli(
    command,
    ['search', query, '--limit', String(RDT_SEARCH_LIMIT), '--yaml'],
    timeoutMs,
  );

  if (result.timedOut || result.exitCode !== 0) {
    return { hits: [], query: `rdt:${query}` };
  }

  const parsed = parseRdtSearchOutput(result.stdout);
  const hits = rdtHitsToSearchHits(parsed).filter((h) => {
    try {
      const host = new URL(h.url).hostname;
      if (isOwnDomain(host, domain)) return false;
    } catch {
      return false;
    }
    return /reddit\.com/i.test(h.url);
  });

  return { hits: hits.slice(0, RDT_SEARCH_LIMIT), query: `rdt:${query}` };
}
