import { AlertTriangle } from 'lucide-react';
import {
  DIMENSION_LABELS,
  LAYER_LABELS,
  type ScoringMeta,
} from '@modules/geo-audit';

interface BottleneckCalloutProps {
  scoringMeta: ScoringMeta;
}

export function BottleneckCallout({ scoringMeta }: BottleneckCalloutProps) {
  const { bottleneck } = scoringMeta;
  if (bottleneck.effectiveScore >= 70) return null;

  return (
    <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-fg mb-1">
            What limits this assessment
          </h3>
          <p className="text-sm text-fg-muted leading-relaxed">
            The primary bottleneck is in the{' '}
            <strong className="text-fg">{LAYER_LABELS[bottleneck.layer]}</strong> layer:{' '}
            <strong className="text-fg">{DIMENSION_LABELS[bottleneck.dimension]}</strong>{' '}
            ({bottleneck.effectiveScore}/100). {bottleneck.reason}
          </p>
        </div>
      </div>
    </div>
  );
}
