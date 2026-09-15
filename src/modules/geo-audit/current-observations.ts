import { canonicalPageUrl } from '@/lib/website-url';

/** Input must be oldest first (timestamp, then id). History is never deleted. */
export function currentObservations<T extends { url: string }>(rows: T[], rootUrl: string): T[] {
  const current = new Map<string, T>();
  for (const row of rows) current.set(canonicalPageUrl(row.url, rootUrl), row);
  return [...current.values()];
}

export function canReadPage(input: { observationStatus?: string; audited?: boolean }): boolean {
  return input.observationStatus ? input.observationStatus !== 'observed' : !input.audited;
}
