/**
 * Client-safe acquisition labels for audit inventory UI.
 * Prefer acquisitionDetail from the API; fall back by observationStatus.
 */

import type { AuditPageEntry } from '@modules/geo-audit';

export type AcquisitionBucket =
  | 'observed'
  | 'timeout'
  | 'blocked'
  | 'rate_limited'
  | 'unreachable'
  | 'parse_error'
  | 'not_run'
  | 'legacy_unknown';

const BADGE_BY_BUCKET: Record<AcquisitionBucket, string> = {
  observed: 'Read successfully',
  timeout: 'Timed out',
  blocked: 'Blocked by site',
  rate_limited: 'Rate limited',
  unreachable: 'Could not connect',
  parse_error: 'Could not read content',
  not_run: 'Not audited yet',
  legacy_unknown: 'Old result — retry needed',
};

const REASON_TO_BUCKET: Record<string, AcquisitionBucket> = {
  observed_ok: 'observed',
  http_partial_observed: 'observed',
  nav_timeout: 'timeout',
  waf_block: 'blocked',
  rate_limited: 'rate_limited',
  dns_or_tls: 'unreachable',
  connection_reset: 'unreachable',
  nav_aborted: 'unreachable',
  err_failed_unclassified: 'unreachable',
  parse_failed: 'parse_error',
  not_audited: 'not_run',
  legacy_missing: 'legacy_unknown',
};

export function acquisitionBucket(page: AuditPageEntry): AcquisitionBucket {
  const reason = page.acquisitionDetail?.reasonCode;
  if (reason && REASON_TO_BUCKET[reason]) return REASON_TO_BUCKET[reason];
  const status = page.observationStatus;
  if (status === 'observed') return 'observed';
  if (status === 'timeout') return 'timeout';
  if (status === 'blocked') return 'blocked';
  if (status === 'rate_limited') return 'rate_limited';
  if (status === 'unreachable') return 'unreachable';
  if (status === 'parse_error') return 'parse_error';
  if (status === 'not_run' || (!page.audited && !status)) return 'not_run';
  if (status === 'legacy_unknown') return 'legacy_unknown';
  if (!page.audited) return 'not_run';
  return 'legacy_unknown';
}

export function acquisitionBadgeLabel(page: AuditPageEntry): string {
  return BADGE_BY_BUCKET[acquisitionBucket(page)];
}

export function acquisitionUserMessage(page: AuditPageEntry): string {
  // Derive display copy from stable status codes. Older audit records may contain
  // localized userMessage values, so persisted prose must not leak into the UI.
  if (page.acquisitionDetail?.reasonCode === 'http_partial_observed') {
    return 'GEO retrieved this page over HTTP, but browser rendering did not finish. Dynamic content may be missing, so the score uses only the static HTML that was retrieved.';
  }
  switch (acquisitionBucket(page)) {
    case 'observed':
      return 'GEO successfully read this page and can analyse its title, content, and structured data.';
    case 'timeout':
      return 'The page may work normally, but GEO could not finish loading it in time. No verified page content was collected, so it was not included in the score.';
    case 'blocked':
      return 'The website or its security service challenged the automated browser, so this page was not included in the score.';
    case 'rate_limited':
      return 'The website temporarily limited automated requests, so GEO could not read this page.';
    case 'unreachable':
      return 'GEO could not connect to this page. No verified content was collected, so it was not included in the score.';
    case 'parse_error':
      return 'The page responded, but GEO could not safely interpret its HTML or rendered content. It was not included in the score.';
    case 'not_run':
      return 'GEO found this page in a sitemap or link, but has not audited it yet.';
    case 'legacy_unknown':
    default:
      return 'This older audit does not contain enough detail to explain the result. Audit the page again to collect a clearer status.';
  }
}

export function acquisitionNextAction(page: AuditPageEntry): string | undefined {
  const bucket = acquisitionBucket(page);
  if (bucket === 'observed') return undefined;
  if (bucket === 'not_run') return 'Select this page and run the audit.';
  if (bucket === 'legacy_unknown') return 'Audit this page again to collect a clearer result.';
  return 'Try this page again. If it keeps failing, review the technical details or choose another representative page.';
}

export function summarizeAcquisition(pages: AuditPageEntry[]): {
  total: number;
  buckets: Record<AcquisitionBucket, number>;
  observed: number;
  summaryLine: string;
} {
  const buckets: Record<AcquisitionBucket, number> = {
    observed: 0,
    timeout: 0,
    blocked: 0,
    rate_limited: 0,
    unreachable: 0,
    parse_error: 0,
    not_run: 0,
    legacy_unknown: 0,
  };
  for (const page of pages) {
    buckets[acquisitionBucket(page)] += 1;
  }
  const parts: string[] = [];
  if (buckets.observed) parts.push(`${buckets.observed} read successfully`);
  if (buckets.timeout) parts.push(`${buckets.timeout} timed out`);
  if (buckets.blocked) parts.push(`${buckets.blocked} blocked by the site`);
  if (buckets.rate_limited) parts.push(`${buckets.rate_limited} rate limited`);
  if (buckets.unreachable) parts.push(`${buckets.unreachable} could not connect`);
  if (buckets.parse_error) parts.push(`${buckets.parse_error} could not be interpreted`);
  if (buckets.not_run) parts.push(`${buckets.not_run} not audited yet`);
  if (buckets.legacy_unknown) parts.push(`${buckets.legacy_unknown} old results need retrying`);
  const summaryLine =
    pages.length === 0
      ? 'No pages discovered yet.'
      : `${pages.length} pages found: ${parts.join(', ')}. The score uses only the ${buckets.observed} pages read successfully.`;
  return { total: pages.length, buckets, observed: buckets.observed, summaryLine };
}
