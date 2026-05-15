/**
 * Diff a new audit against the previous baseline to produce alerts.
 */

import { randomId } from '@shared/util/id';
import { parseJson } from '@shared/database/client';
import { type DimensionScore, DIMENSIONS } from '@modules/geo-audit';
import type { Alert } from './schemas';

interface AuditLike {
  overallScore: number;
  dimensions: string; // JSON
}

const REGRESSION_THRESHOLD = 8;
const IMPROVEMENT_THRESHOLD = 8;

export function diffAudits(previous: AuditLike, current: AuditLike): Alert[] {
  const alerts: Alert[] = [];

  const prevOverall = previous.overallScore;
  const curOverall = current.overallScore;
  const deltaOverall = curOverall - prevOverall;
  if (deltaOverall <= -REGRESSION_THRESHOLD) {
    alerts.push({
      id: randomId(),
      severity: 'regression',
      title: `GEO score dropped ${Math.abs(deltaOverall)} points`,
      detail: `Overall fell from ${prevOverall} to ${curOverall}.`,
      dimension: null,
      delta: deltaOverall,
    });
  } else if (deltaOverall >= IMPROVEMENT_THRESHOLD) {
    alerts.push({
      id: randomId(),
      severity: 'info',
      title: `GEO score improved ${deltaOverall} points`,
      detail: `Overall rose from ${prevOverall} to ${curOverall}.`,
      dimension: null,
      delta: deltaOverall,
    });
  }

  const prevDims = parseJson<Record<string, DimensionScore>>(previous.dimensions, {});
  const curDims = parseJson<Record<string, DimensionScore>>(current.dimensions, {});

  for (const dim of DIMENSIONS) {
    const pv = prevDims[dim]?.score ?? 0;
    const cv = curDims[dim]?.score ?? 0;
    const delta = cv - pv;
    if (Math.abs(delta) < 10) continue;
    alerts.push({
      id: randomId(),
      severity: delta < 0 ? 'regression' : 'info',
      title: `${dim} ${delta < 0 ? 'regressed' : 'improved'} by ${Math.abs(delta)} points`,
      detail: `From ${pv} to ${cv}.`,
      dimension: dim,
      delta,
    });
  }

  return alerts;
}
