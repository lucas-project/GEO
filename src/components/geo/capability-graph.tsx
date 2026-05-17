import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SCORE_LAYERS,
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  type Dimension,
  type DimensionScore,
  type ScoringMeta,
} from '@modules/geo-audit';
import { DimensionBar } from './dimension-bar';

interface CapabilityGraphProps {
  scoringMeta: ScoringMeta;
  dimensions: Record<Dimension, DimensionScore>;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'border-success/40 bg-success/5';
  if (score >= 60) return 'border-warning/40 bg-warning/5';
  return 'border-danger/40 bg-danger/5';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

type LayerEntry = {
  layer: (typeof SCORE_LAYERS)[number];
  layerScore: NonNullable<ScoringMeta['layers'][keyof ScoringMeta['layers']]>;
  effective: number;
  gated: boolean;
  isBottleneck: boolean;
};

function LayerCard({
  item,
  bottleneckDim,
  dimensions,
}: {
  item: LayerEntry;
  bottleneckDim: Dimension;
  dimensions: Record<Dimension, DimensionScore>;
}) {
  const { layer, layerScore, effective, gated, isBottleneck } = item;

  return (
    <div
      className={cn(
        'h-full rounded-xl border p-4 min-w-0 overflow-hidden',
        scoreColor(effective),
        isBottleneck && 'ring-2 ring-warning/50',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg">
              {LAYER_LABELS[layer]}
            </span>
            {isBottleneck && (
              <span className="text-[10px] font-medium text-warning normal-case">bottleneck</span>
            )}
          </div>
          <p className="text-[11px] text-fg-subtle mt-1 leading-snug break-words">
            {LAYER_DESCRIPTIONS[layer]}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn('text-2xl font-semibold tabular-nums leading-none', scoreTextColor(effective))}>
            {effective}
          </div>
          {gated && (
            <div className="text-[10px] text-fg-subtle mt-0.5 whitespace-nowrap">
              raw {layerScore.rawScore}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5 min-w-0">
        {layerScore.dimensions.map((dim) => (
          <DimensionBar
            key={dim}
            compact
            name={DIMENSION_LABELS[dim]}
            score={dimensions[dim]?.score ?? 0}
            description={
              dim === bottleneckDim
                ? dimensions[dim]?.reasons[0] ?? DIMENSION_DESCRIPTIONS[dim]
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export function CapabilityGraph({ scoringMeta, dimensions }: CapabilityGraphProps) {
  const bottleneckLayer = scoringMeta.bottleneck.layer;
  const bottleneckDim = scoringMeta.bottleneck.dimension;

  const layers: LayerEntry[] = [];
  for (const layer of SCORE_LAYERS) {
    const layerScore = scoringMeta.layers[layer];
    if (!layerScore) continue;
    layers.push({
      layer,
      layerScore,
      effective: layerScore.effectiveScore,
      gated: layerScore.rawScore > layerScore.effectiveScore,
      isBottleneck: layer === bottleneckLayer,
    });
  }

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-fg-muted">
        AI visibility flows through four causal layers. Weak upstream layers cap downstream scores.
      </p>

      {/* Narrow viewports: vertical stack */}
      <div className="flex flex-col gap-2 sm:hidden min-w-0">
        {layers.map((item, index) => (
          <div key={item.layer} className="min-w-0">
            <LayerCard item={item} bottleneckDim={bottleneckDim} dimensions={dimensions} />
            {index < layers.length - 1 && (
              <div className="flex justify-center py-1 text-fg-subtle" aria-hidden>
                <ChevronDown className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* sm+: 2×2 grid — wide enough for Understanding (4 dimensions) */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-4 min-w-0">
        {layers.map((item) => (
          <LayerCard key={item.layer} item={item} bottleneckDim={bottleneckDim} dimensions={dimensions} />
        ))}
      </div>
    </div>
  );
}
