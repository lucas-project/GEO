'use client';

import { CheckCircle2, MinusCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type Dimension,
  type DimensionScore,
  type GateApplied,
  type ScoreLayer,
  dimensionsForLayer,
  expandReason,
  isNegativeReason,
  LAYER_SCORING_INTRO,
  plainDimensionLabel,
  GATE_LAYERS,
  plainGateExplanation,
  plainWhatWeCheck,
} from '@modules/geo-audit';

/** Extra context without repeating the raw scoring line. */
function reasonDetail(reason: string): string | null {
  const expanded = expandReason(reason);
  const r = reason.trim();
  if (expanded === r) return null;
  if (expanded.startsWith(r)) {
    const tail = expanded.slice(r.length).replace(/^[\s.—-]+/, '').trim();
    return tail.length >= 24 ? tail : null;
  }
  return expanded;
}

function dedupeReasons(reasons: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of reasons) {
    const key = r.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r.trim());
  }
  return out;
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-warning';
  return 'bg-danger';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

interface LayerScoringBreakdownProps {
  layer: ScoreLayer;
  dimensions: Record<Dimension, DimensionScore>;
  gates?: GateApplied[];
  className?: string;
}

export function LayerScoringBreakdown({
  layer,
  dimensions,
  gates = [],
  className,
}: LayerScoringBreakdownProps) {
  const dims = dimensionsForLayer(layer);
  const layerGates = gates.filter((g) => GATE_LAYERS[g.type]?.includes(layer));

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-[11px] leading-relaxed text-fg-muted">{LAYER_SCORING_INTRO[layer]}</p>

      <div className="space-y-3">
        {dims.map((dim) => {
          const data = dimensions[dim];
          if (!data) return null;
          const reasons = dedupeReasons(data.reasons);
          const positives = reasons.filter((r) => !isNegativeReason(r));
          const negatives = reasons.filter((r) => isNegativeReason(r));

          return (
            <div
              key={dim}
              className="rounded-lg border border-border-subtle bg-bg-elevated/50 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h5 className="text-xs font-medium text-fg">{plainDimensionLabel(dim)}</h5>
                  <p className="text-[10px] text-fg-subtle mt-0.5 leading-snug">
                    <span className="font-medium text-fg-muted">We check: </span>
                    {plainWhatWeCheck(dim)}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums shrink-0',
                    scoreTextColor(data.score),
                  )}
                >
                  {data.score}
                </span>
              </div>

              <div className="h-1 rounded-full bg-bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full', scoreBarColor(data.score))}
                  style={{ width: `${data.score}%` }}
                />
              </div>

              {positives.length > 0 && (
                <ReasonGroup
                  variant="positive"
                  title="What helped"
                  reasons={positives}
                />
              )}
              {negatives.length > 0 && (
                <ReasonGroup
                  variant="negative"
                  title="What held this back"
                  reasons={negatives}
                />
              )}
              {positives.length === 0 && negatives.length === 0 && (
                <p className="text-[10px] text-fg-subtle italic">No specific signals recorded.</p>
              )}
            </div>
          );
        })}
      </div>

      {layerGates.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Why this score is lower
          </h5>
          <ul className="space-y-2">
            {layerGates.map((gate) => (
              <li key={gate.type + gate.description} className="text-[11px] text-fg-muted leading-relaxed">
                {plainGateExplanation(gate)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReasonGroup({
  variant,
  title,
  reasons,
}: {
  variant: 'positive' | 'negative';
  title: string;
  reasons: string[];
}) {
  const Icon = variant === 'positive' ? CheckCircle2 : MinusCircle;
  const iconClass = variant === 'positive' ? 'text-success' : 'text-danger';

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-fg-subtle uppercase tracking-wide">{title}</p>
      <ul className="space-y-2">
        {reasons.map((reason) => {
          const detail = reasonDetail(reason);
          return (
            <li key={reason} className="flex gap-2 text-[11px] leading-relaxed">
              <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', iconClass)} aria-hidden />
              <div className="min-w-0">
                <p className="text-fg font-medium">{reason}</p>
                {detail && <p className="text-fg-subtle mt-0.5 leading-snug">{detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
