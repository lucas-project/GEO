import type { ScoringMeta } from './schemas';

export type AuditReportStatus = 'completed' | 'partial' | 'failed';
export type AuditCompletion = 'complete' | 'partial' | 'failed';

export interface AuditExecutionState {
  status: AuditReportStatus;
  completion: AuditCompletion;
  stopReason?: string;
  requestedPages: number;
  auditedPages: number;
  discoveredPages: number;
  sampleCoverage: number;
  discoveryCoverage: number;
  sampleCoverageStatus: 'ready' | 'partial' | 'insufficient_evidence';
}

/** Derive coherent audit status + sample coverage fields at commit time. */
export function resolveAuditExecutionState(input: {
  maxPages: number;
  auditedPages: number;
  discoveredPages: number;
  stopReason?: string | null;
  failed?: boolean;
}): AuditExecutionState {
  const requestedPages = Math.max(0, input.maxPages);
  const auditedPages = Math.max(0, input.auditedPages);
  const discoveredPages = Math.max(0, input.discoveredPages);
  const sampleCoverage =
    requestedPages > 0 ? Math.min(1, auditedPages / requestedPages) : auditedPages > 0 ? 1 : 0;
  const discoveryCoverage =
    discoveredPages > 0 ? Math.min(1, auditedPages / discoveredPages) : 0;

  const targetSample = Math.min(requestedPages, Math.max(discoveredPages, requestedPages));
  const sampleCoverageStatus: AuditExecutionState['sampleCoverageStatus'] =
    auditedPages >= targetSample && auditedPages > 0
      ? 'ready'
      : auditedPages > 0
        ? 'partial'
        : 'insufficient_evidence';

  if (input.failed) {
    return {
      status: 'failed',
      completion: 'failed',
      stopReason: input.stopReason ?? undefined,
      requestedPages,
      auditedPages,
      discoveredPages,
      sampleCoverage,
      discoveryCoverage,
      sampleCoverageStatus,
    };
  }

  // Discovery can exhaust a request budget after every explicitly selected
  // page has already been observed. That limits site-wide discovery, not the
  // contracted sample, so it must not make the report itself partial.
  const budgetPartial = Boolean(input.stopReason) && sampleCoverageStatus !== 'ready';
  const samplePartial = sampleCoverageStatus !== 'ready';
  const isPartial = budgetPartial || samplePartial;

  return {
    status: isPartial ? 'partial' : 'completed',
    completion: isPartial ? 'partial' : 'complete',
    stopReason: input.stopReason ?? undefined,
    requestedPages,
    auditedPages,
    discoveredPages,
    sampleCoverage,
    discoveryCoverage,
    sampleCoverageStatus,
  };
}

/**
 * Map DB status + scoringMeta into the API status enum.
 * Legacy rows may store completed while meta.completion is partial.
 */
export function resolveDisplayedAuditStatus(
  dbStatus: string | null | undefined,
  scoringMeta: ScoringMeta | null | undefined,
): AuditReportStatus | undefined {
  if (dbStatus === 'failed' || dbStatus === 'partial' || dbStatus === 'completed') {
    if (dbStatus === 'completed' && scoringMeta?.completion === 'partial') return 'partial';
    if (dbStatus === 'completed' && scoringMeta?.stopReason) return 'partial';
    return dbStatus;
  }
  if (scoringMeta?.completion === 'partial' || scoringMeta?.stopReason) return 'partial';
  if (scoringMeta?.completion === 'failed') return 'failed';
  if (scoringMeta?.completion === 'complete') return 'completed';
  if (dbStatus === 'running') return undefined;
  return undefined;
}

export function applyExecutionStateToMeta(
  meta: ScoringMeta,
  state: AuditExecutionState,
): ScoringMeta {
  return {
    ...meta,
    requestedPages: state.requestedPages,
    auditedPages: state.auditedPages,
    discoveredPages: state.discoveredPages,
    sampleCoverage: state.sampleCoverage,
    discoveryCoverage: state.discoveryCoverage,
    sampleCoverageStatus: state.sampleCoverageStatus,
    completion: state.completion,
    ...(state.stopReason ? { stopReason: state.stopReason } : {}),
  };
}
