/**
 * Crawl acquisition classification + user-facing copy.
 * Internal status/reasonCode stay technical; primary UI uses userMessage/nextAction only.
 */

import { z } from 'zod';

export const FETCH_STATUSES = [
  'observed',
  'blocked',
  'timeout',
  'rate_limited',
  'parse_error',
  'unreachable',
  'not_run',
  'legacy_unknown',
] as const;
export type FetchStatus = (typeof FETCH_STATUSES)[number];

export const ACQUISITION_STAGES = [
  'robots',
  'sitemap',
  'navigation',
  'render',
  'parse',
  'http_probe',
] as const;
export type AcquisitionStage = (typeof ACQUISITION_STAGES)[number];

export const ACQUISITION_REASON_CODES = [
  'app_dependency',
  'environment_network',
  'nav_timeout',
  'waf_block',
  'rate_limited',
  'dns_or_tls',
  'connection_reset',
  'nav_aborted',
  'parse_failed',
  'err_failed_unclassified',
  'legacy_missing',
  'not_audited',
  'http_partial_observed',
  'observed_ok',
] as const;
export type AcquisitionReasonCode = (typeof ACQUISITION_REASON_CODES)[number];

export const FETCH_CHANNELS = ['stealth', 'headed', 'http'] as const;
export type FetchChannel = (typeof FETCH_CHANNELS)[number];

export const AcquisitionAttemptSchema = z.object({
  channel: z.enum(FETCH_CHANNELS),
  outcome: z.enum(['success', 'failed', 'skipped']),
  elapsedMs: z.number().nonnegative(),
  reasonCode: z.enum(ACQUISITION_REASON_CODES).optional(),
  technicalMessage: z.string().optional(),
});
export type AcquisitionAttempt = z.infer<typeof AcquisitionAttemptSchema>;

export const AcquisitionDetailSchema = z.object({
  stage: z.enum(ACQUISITION_STAGES),
  reasonCode: z.enum(ACQUISITION_REASON_CODES),
  userMessage: z.string().min(1),
  nextAction: z.string().min(1),
  technicalMessage: z.string().optional(),
  elapsedMs: z.number().nonnegative().optional(),
  httpStatus: z.number().int().optional(),
  finalUrl: z.string().optional(),
  fetchChannel: z.enum(FETCH_CHANNELS).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  attemptedAt: z.string().optional(),
  waitCondition: z.string().optional(),
  browserRenderComplete: z.boolean().optional(),
  attempts: z.array(AcquisitionAttemptSchema).optional(),
});
export type AcquisitionDetail = z.infer<typeof AcquisitionDetailSchema>;

export interface AcquisitionCopy {
  badge: string;
  userMessage: string;
  nextAction: string;
  /** True when this page's content must not count toward scoring. */
  excludeFromScore: boolean;
}

const COPY_BY_REASON: Record<AcquisitionReasonCode, AcquisitionCopy> = {
  app_dependency: {
    badge: 'Browser unavailable',
    userMessage: 'GEO could not start its browser. No page evidence was collected; this is an application dependency problem.',
    nextAction: 'Install the configured browser on the GEO server, verify that it launches, then retry.',
    excludeFromScore: true,
  },
  environment_network: {
    badge: 'Server network denied',
    userMessage: 'The GEO server environment denied network access. This does not show that the target website is broken or blocking GEO.',
    nextAction: 'Allow outbound network access for the server and retry.',
    excludeFromScore: true,
  },
  observed_ok: {
    badge: 'Read successfully',
    userMessage: 'GEO retrieved this page and can analyse its title, content, and structured data.',
    nextAction: 'No action needed.',
    excludeFromScore: false,
  },
  http_partial_observed: {
    badge: 'Read with limitations',
    userMessage:
      'GEO retrieved the page over HTTP, but browser rendering did not finish. Dynamic content may be missing, so the score uses only the static HTML that was retrieved.',
    nextAction: 'Retry for complete rendered evidence, or confirm that the page loads in an automated browser.',
    excludeFromScore: false,
  },
  nav_timeout: {
    badge: 'Timed out',
    userMessage:
      'The page may work normally for visitors, but GEO could not finish loading it within the time limit. No verifiable page content was retrieved, so this page was excluded from the score.',
    nextAction: 'Retry once. If it still fails, check the CDN, scripts, and initial load time, or share the technical details with the site administrator.',
    excludeFromScore: true,
  },
  waf_block: {
    badge: 'Blocked by website',
    userMessage: 'The website or WAF rejected or challenged GEO\'s automated request. This page was excluded from the score.',
    nextAction: 'Check WAF or bot-management settings, retry later, or provide page evidence manually.',
    excludeFromScore: true,
  },
  rate_limited: {
    badge: 'Temporarily rate limited',
    userMessage: 'The website temporarily limited GEO because of the request rate or source. This page could not be read.',
    nextAction: 'Wait and retry, select fewer pages, or reduce crawl concurrency.',
    excludeFromScore: true,
  },
  dns_or_tls: {
    badge: 'Could not connect',
    userMessage: 'GEO could not establish a secure connection because DNS, TLS, or certificate validation failed.',
    nextAction: 'Check DNS, TLS, and proxy settings from the server environment, then retry.',
    excludeFromScore: true,
  },
  connection_reset: {
    badge: 'Could not connect',
    userMessage: 'The connection was reset or interrupted before GEO could read this page.',
    nextAction: 'Retry later. If this continues, check the network path, firewall, and proxy configuration.',
    excludeFromScore: true,
  },
  nav_aborted: {
    badge: 'Load interrupted',
    userMessage: 'Page loading was cancelled or interrupted before GEO could retrieve verifiable content.',
    nextAction: 'Retry this page. If the job was cancelled manually, run the audit again.',
    excludeFromScore: true,
  },
  parse_failed: {
    badge: 'Content could not be parsed',
    userMessage: 'The website responded, but GEO could not safely parse the HTML, encoding, or rendered output. This page was excluded from the score.',
    nextAction: 'Check the response content type, character encoding, and JavaScript rendering, then retry.',
    excludeFromScore: true,
  },
  err_failed_unclassified: {
    badge: 'Could not connect',
    userMessage:
      'The page may work normally for visitors, but GEO\'s automated browser could not finish loading it because of a network-level error. No verifiable content was retrieved, so this page was excluded from the score.',
    nextAction: 'Retry once. If it still fails, check whether the CDN or WAF blocks automated access, or review the technical details.',
    excludeFromScore: true,
  },
  legacy_missing: {
    badge: 'Re-crawl required',
    userMessage: 'This audit was created before detailed crawl records were available, so GEO cannot determine what happened.',
    nextAction: 'Re-crawl this page to generate an explainable acquisition status.',
    excludeFromScore: true,
  },
  not_audited: {
    badge: 'Not read yet',
    userMessage: 'GEO discovered this page through a sitemap or link, but has not crawled it yet.',
    nextAction: 'Select this page and run the audit.',
    excludeFromScore: true,
  },
};

const STATUS_DEFAULT_REASON: Record<FetchStatus, AcquisitionReasonCode> = {
  observed: 'observed_ok',
  blocked: 'waf_block',
  timeout: 'nav_timeout',
  rate_limited: 'rate_limited',
  parse_error: 'parse_failed',
  unreachable: 'err_failed_unclassified',
  not_run: 'not_audited',
  legacy_unknown: 'legacy_missing',
};

export function copyForReasonCode(reasonCode: AcquisitionReasonCode): AcquisitionCopy {
  return COPY_BY_REASON[reasonCode];
}

export function copyForFetchStatus(status: FetchStatus): AcquisitionCopy {
  return COPY_BY_REASON[STATUS_DEFAULT_REASON[status]];
}

/** Resolve display copy from detail or status; never exposes legacy_unknown as primary text. */
export function resolveAcquisitionCopy(input: {
  observationStatus?: FetchStatus | string | null;
  acquisitionDetail?: AcquisitionDetail | null;
  audited?: boolean;
}): AcquisitionCopy {
  if (input.acquisitionDetail?.reasonCode) {
    return copyForReasonCode(input.acquisitionDetail.reasonCode);
  }
  const status = (input.observationStatus ??
    (input.audited === false ? 'not_run' : 'legacy_unknown')) as FetchStatus;
  if (status === 'legacy_unknown') return copyForReasonCode('legacy_missing');
  if ((FETCH_STATUSES as readonly string[]).includes(status)) {
    return copyForFetchStatus(status);
  }
  return copyForReasonCode('legacy_missing');
}

export function classifyNavigationError(
  err: unknown,
  ctx?: { httpStatus?: number },
): {
  fetchStatus: FetchStatus;
  reasonCode: AcquisitionReasonCode;
  userMessage: string;
  nextAction: string;
  technicalMessage: string;
} {
  const technicalMessage = err instanceof Error ? err.message : String(err);
  const lower = technicalMessage.toLowerCase();
  const environmentReason = /err_network_access_denied|eacces|eperm/i.test(technicalMessage) ? 'environment_network' : /executable doesn't exist|browser dependency|browser.*not found/i.test(technicalMessage) ? 'app_dependency' : null;
  if (environmentReason) {
    const copy = copyForReasonCode(environmentReason);
    return { fetchStatus: 'unreachable', reasonCode: environmentReason, userMessage: copy.userMessage, nextAction: copy.nextAction, technicalMessage };
  }

  if (ctx?.httpStatus === 429 || /\b429\b/.test(technicalMessage) || /rate.?limit/i.test(technicalMessage)) {
    const copy = copyForReasonCode('rate_limited');
    return {
      fetchStatus: 'rate_limited',
      reasonCode: 'rate_limited',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  if (
    /timeout/i.test(technicalMessage) ||
    /timed?\s*out/i.test(technicalMessage) ||
    /exceeded/i.test(lower) && /timeout|navigation|waiting/i.test(lower)
  ) {
    const copy = copyForReasonCode('nav_timeout');
    return {
      fetchStatus: 'timeout',
      reasonCode: 'nav_timeout',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  if (
    /err_name_not_resolved|enotfound|dns|cert_|ssl|tls|err_cert|err_ssl|certificate/i.test(
      technicalMessage,
    )
  ) {
    const copy = copyForReasonCode('dns_or_tls');
    return {
      fetchStatus: 'unreachable',
      reasonCode: 'dns_or_tls',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  if (
    /econnreset|connection.?reset|err_connection_refused|err_connection_closed|err_internet_disconnected|err_address_unreachable|err_network_changed/i.test(
      technicalMessage,
    )
  ) {
    const copy = copyForReasonCode('connection_reset');
    return {
      fetchStatus: 'unreachable',
      reasonCode: 'connection_reset',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  if (/abort|cancelled|canceled|target closed|browser has been closed/i.test(technicalMessage)) {
    const copy = copyForReasonCode('nav_aborted');
    return {
      fetchStatus: 'unreachable',
      reasonCode: 'nav_aborted',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  if (/parse|encoding|charset|invalid html|unexpected token/i.test(technicalMessage)) {
    const copy = copyForReasonCode('parse_failed');
    return {
      fetchStatus: 'parse_error',
      reasonCode: 'parse_failed',
      userMessage: copy.userMessage,
      nextAction: copy.nextAction,
      technicalMessage,
    };
  }

  // Bare ERR_FAILED or unclassified network failure
  const copy = copyForReasonCode('err_failed_unclassified');
  return {
    fetchStatus: 'unreachable',
    reasonCode: 'err_failed_unclassified',
    userMessage: copy.userMessage,
    nextAction: copy.nextAction,
    technicalMessage,
  };
}

export function buildAcquisitionDetail(input: {
  stage: AcquisitionStage;
  reasonCode: AcquisitionReasonCode;
  technicalMessage?: string;
  elapsedMs?: number;
  httpStatus?: number;
  finalUrl?: string;
  fetchChannel?: FetchChannel;
  retryCount?: number;
  waitCondition?: string;
  browserRenderComplete?: boolean;
  attempts?: AcquisitionAttempt[];
}): AcquisitionDetail {
  const copy = copyForReasonCode(input.reasonCode);
  return {
    stage: input.stage,
    reasonCode: input.reasonCode,
    userMessage: copy.userMessage,
    nextAction: copy.nextAction,
    technicalMessage: input.technicalMessage,
    elapsedMs: input.elapsedMs,
    httpStatus: input.httpStatus,
    finalUrl: input.finalUrl,
    fetchChannel: input.fetchChannel,
    retryCount: input.retryCount ?? 0,
    attemptedAt: new Date().toISOString(),
    waitCondition: input.waitCondition,
    browserRenderComplete: input.browserRenderComplete,
    attempts: input.attempts,
  };
}

export function detailForBlocked(input: {
  reason?: string | null;
  elapsedMs: number;
  httpStatus?: number;
  finalUrl?: string;
  fetchChannel?: FetchChannel;
  retryCount?: number;
  attempts?: AcquisitionAttempt[];
}): AcquisitionDetail {
  return buildAcquisitionDetail({
    stage: 'navigation',
    reasonCode: 'waf_block',
    technicalMessage: input.reason ?? undefined,
    elapsedMs: input.elapsedMs,
    httpStatus: input.httpStatus,
    finalUrl: input.finalUrl,
    fetchChannel: input.fetchChannel,
    retryCount: input.retryCount,
    browserRenderComplete: false,
    attempts: input.attempts,
  });
}

export function detailForObserved(input: {
  elapsedMs: number;
  httpStatus?: number;
  finalUrl?: string;
  fetchChannel?: FetchChannel;
  browserRenderComplete: boolean;
  retryCount?: number;
  attempts?: AcquisitionAttempt[];
  technicalMessage?: string;
}): AcquisitionDetail {
  return buildAcquisitionDetail({
    stage: input.fetchChannel === 'http' ? 'http_probe' : 'render',
    reasonCode: input.browserRenderComplete ? 'observed_ok' : 'http_partial_observed',
    technicalMessage: input.technicalMessage,
    elapsedMs: input.elapsedMs,
    httpStatus: input.httpStatus,
    finalUrl: input.finalUrl,
    fetchChannel: input.fetchChannel,
    retryCount: input.retryCount,
    browserRenderComplete: input.browserRenderComplete,
    attempts: input.attempts,
  });
}

/** Assert primary UI strings never leak banned technical tokens. */
export function assertSafeUserFacingCopy(text: string): boolean {
  const banned = [/legacy_unknown/i, /domcontentloaded/i, /net::ERR_FAILED/i, /\bERR_FAILED\b/];
  return !banned.some((re) => re.test(text));
}
