import { cn } from '@/lib/utils';
import type { ScoringMeta } from '@modules/geo-audit';

interface CitationProbabilityCardProps {
  scoringMeta: ScoringMeta;
  className?: string;
}

function probColorClass(p: number): string {
  if (p >= 0.65) return 'text-success';
  if (p >= 0.4) return 'text-warning';
  return 'text-danger';
}

export function CitationProbabilityCard({ scoringMeta, className }: CitationProbabilityCardProps) {
  const pct = Math.round(scoringMeta.citationProbability * 100);
  const hasSnapshot = scoringMeta.gatesApplied.some((g) => g.type === 'citation_snapshot');
  const runCount = scoringMeta.simulationRunCount;

  return (
    <div className={cn('rounded-xl border border-border bg-bg-elevated p-5', className)}>
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-2">
        Citation-related signals
      </div>
      <div className={cn('text-5xl font-semibold tabular-nums', probColorClass(scoringMeta.citationProbability))}>
        {pct}%
      </div>
      <p className="mt-2 text-xs text-fg-muted leading-relaxed max-w-[240px]">
        {hasSnapshot
          ? 'Observed simulation context is available. This is not a prediction of real-world citation probability.'
          : 'On-page signals only. Run a compatible, evidence-backed experiment before drawing citation conclusions.'}
      </p>
      <div className="mt-3">
        {hasSnapshot ? (
          <span className="inline-flex items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            {runCount != null && runCount > 0
              ? `Calibrated with ${runCount} simulation runs`
              : 'Calibrated with simulation data'}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
            No citation experiment
          </span>
        )}
      </div>
    </div>
  );
}
