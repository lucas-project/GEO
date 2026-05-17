'use client';

import Link from 'next/link';
import { X, ExternalLink, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import type { Alert } from '@modules/monitoring';

const KIND_LABELS: Record<string, string> = {
  score: 'Score',
  citation: 'Citation',
  visibility: 'Visibility',
  schema: 'Schema',
  structure: 'Structure',
  entity: 'Entity',
  readability: 'Readability',
  extraction: 'Extraction',
  competitor: 'Competitor',
  issue: 'Issue',
};

interface MonitorRunDetailProps {
  run: {
    id: string;
    runAt: string;
    auditId: string | null;
    overallScore: number | null;
    alerts: Alert[];
    overallDelta: number | null;
  };
  siteUrl: string;
  onClose: () => void;
}

function AlertIcon({ severity }: { severity: Alert['severity'] }) {
  if (severity === 'regression') return <TrendingDown className="w-4 h-4 text-danger shrink-0" />;
  if (severity === 'info') return <TrendingUp className="w-4 h-4 text-success shrink-0" />;
  return <Info className="w-4 h-4 text-warning shrink-0" />;
}

export function MonitorRunDetail({ run, siteUrl, onClose }: MonitorRunDetailProps) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-fg">Run details</h3>
          <p className="text-[12px] text-fg-subtle mt-0.5">{formatDate(run.runAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          {run.auditId && (
            <Link
              href={`/audit/${run.auditId}`}
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-bg-subtle"
            >
              Full audit
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title="Close run details">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {run.overallScore !== null && (
        <p className="text-xs text-fg-muted">
          GEO score: <span className="font-medium text-fg">{run.overallScore}</span>
          {run.overallDelta != null && run.overallDelta !== 0 && (
            <span className={run.overallDelta > 0 ? ' text-success' : ' text-danger'}>
              {' '}
              ({run.overallDelta > 0 ? '+' : ''}
              {run.overallDelta} vs previous)
            </span>
          )}
        </p>
      )}

      {run.alerts.length === 0 ? (
        <p className="text-xs text-fg-muted">No regressions or notable changes vs the previous run.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-auto">
          {run.alerts.map((alert) => (
            <li
              key={alert.id}
              className="rounded-md border border-border-subtle bg-bg p-2.5 flex gap-2"
            >
              <AlertIcon severity={alert.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {alert.kind && (
                    <Badge variant="outline" className="text-[12px]">
                      {KIND_LABELS[alert.kind] ?? alert.kind}
                    </Badge>
                  )}
                  <span className="text-xs font-medium text-fg">{alert.title}</span>
                </div>
                {alert.detail && (
                  <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">{alert.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-fg-subtle truncate">{siteUrl}</p>
    </section>
  );
}
