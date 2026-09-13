import { config } from '@shared/config';
import type { FetchPageFn, FetchedPage } from './platforms/types';

function skipped(status: FetchedPage['observationStatus'], reason: string, url: string): FetchedPage {
  return { html: '', statusCode: 0, finalUrl: url, fetchMethod: 'http', observationStatus: status, blockReason: reason };
}

/**
 * Bound one presence scan without hiding gaps as negative evidence. A block or
 * rate limit opens a per-run host circuit; callers receive a typed outcome.
 */
export function createBudgetedFetchPage(
  fetchPage: FetchPageFn,
  limits = {
    maxRequests: config.presenceProbe.maxRequestsPerRun,
    maxRequestsPerHost: config.presenceProbe.maxRequestsPerHost,
  },
): FetchPageFn {
  let totalRequests = 0;
  const hostRequests = new Map<string, number>();
  const blockedHosts = new Set<string>();
  const rateLimitedHosts = new Set<string>();

  return async (url, options) => {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return skipped('parse_error', 'invalid_url', url);
    }
    if (blockedHosts.has(host)) return skipped('blocked', 'host_circuit_open', url);
    if (rateLimitedHosts.has(host)) return skipped('rate_limited', 'host_rate_limited', url);
    if (totalRequests >= limits.maxRequests) return skipped('blocked', 'run_request_budget_exhausted', url);
    const usedByHost = hostRequests.get(host) ?? 0;
    if (usedByHost >= limits.maxRequestsPerHost) return skipped('blocked', 'host_request_budget_exhausted', url);

    totalRequests += 1;
    hostRequests.set(host, usedByHost + 1);
    const result = await fetchPage(url, options);
    if (result.observationStatus === 'blocked' || result.statusCode === 403) blockedHosts.add(host);
    if (result.observationStatus === 'rate_limited' || result.statusCode === 429) rateLimitedHosts.add(host);
    return result;
  };
}
