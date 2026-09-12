'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { ChevronDown, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SCORE_LAYERS,
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  DIMENSION_LABELS,
  type Dimension,
  type DimensionScore,
  type ScoringMeta,
} from '@modules/geo-audit';
import { DimensionBar } from './dimension-bar';
import { LayerEvidencePanel } from './layer-evidence-panel';

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

const LayerCardShell = forwardRef<
  HTMLDivElement,
  {
    item: LayerEntry;
    children: ReactNode;
    onExpand?: () => void;
    className?: string;
  }
>(function LayerCardShell({ item, children, onExpand, className }, ref) {
  const { layer, layerScore, effective, gated, isBottleneck } = item;

  return (
    <div
      ref={ref}
      className={cn(
        'h-full rounded-xl border p-4 min-w-0 overflow-hidden scroll-mt-4',
        scoreColor(effective),
        isBottleneck && 'ring-2 ring-warning/50',
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-2 min-w-0">
            <span
              className="text-xs font-semibold uppercase tracking-wider text-fg truncate"
              title={LAYER_LABELS[layer]}
            >
              {LAYER_LABELS[layer]}
            </span>
            {isBottleneck && (
              <span className="text-[10px] font-medium text-warning normal-case shrink-0">
                bottleneck
              </span>
            )}
          </div>
          <p className="text-[11px] text-fg-subtle mt-1 leading-snug break-words">
            {LAYER_DESCRIPTIONS[layer]}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted/80 transition-colors"
              aria-label={`Expand ${LAYER_LABELS[layer]} layer details`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="text-right">
            <div
              className={cn('text-2xl font-semibold tabular-nums leading-none', scoreTextColor(effective))}
            >
              {effective}
            </div>
            {gated && (
              <div
                className="text-[10px] text-fg-subtle mt-0.5 whitespace-nowrap"
                title="From this layer's checks only, before earlier pipeline steps apply"
              >
                alone {layerScore.rawScore}
              </div>
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
});

function LayerCardBody({
  item,
  bottleneckDim,
  dimensions,
  layerEvidence,
  scoringMeta,
  expanded = false,
  onCollapse,
  cardRef,
}: {
  item: LayerEntry;
  bottleneckDim: Dimension;
  dimensions: Record<Dimension, DimensionScore>;
  layerEvidence?: ScoringMeta['layerEvidence'];
  scoringMeta: ScoringMeta;
  expanded?: boolean;
  onCollapse?: () => void;
  cardRef?: RefObject<HTMLDivElement | null>;
}) {
  const { layer } = item;
  const evidence = layerEvidence?.[layer];

  return (
    <>
      <div className="space-y-2.5 min-w-0">
        {item.layerScore.dimensions.map((dim) => (
          <DimensionBar
            key={dim}
            compact
            name={DIMENSION_LABELS[dim]}
            score={dimensions[dim]?.score ?? 0}
            description={
              expanded
                ? undefined
                : dim === bottleneckDim
                  ? dimensions[dim]?.reasons[0]
                  : undefined
            }
          />
        ))}
      </div>

      {evidence && (
        <LayerEvidencePanel
          evidence={evidence}
          layer={layer}
          dimensions={dimensions}
          gates={scoringMeta.gatesApplied}
          expanded={expanded}
          onCollapse={onCollapse}
          scrollTargetRef={cardRef}
        />
      )}
    </>
  );
}

function LayerCard({
  item,
  bottleneckDim,
  dimensions,
  layerEvidence,
  scoringMeta,
  onExpand,
}: {
  item: LayerEntry;
  bottleneckDim: Dimension;
  dimensions: Record<Dimension, DimensionScore>;
  layerEvidence?: ScoringMeta['layerEvidence'];
  scoringMeta: ScoringMeta;
  onExpand: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <LayerCardShell ref={cardRef} item={item} onExpand={onExpand}>
      <LayerCardBody
        item={item}
        bottleneckDim={bottleneckDim}
        dimensions={dimensions}
        layerEvidence={layerEvidence}
        scoringMeta={scoringMeta}
        cardRef={cardRef}
      />
    </LayerCardShell>
  );
}

export function CapabilityGraph({ scoringMeta, dimensions }: CapabilityGraphProps) {
  const bottleneckLayer = scoringMeta.bottleneck.layer;
  const bottleneckDim = scoringMeta.bottleneck.dimension;
  const [expandedLayer, setExpandedLayer] = useState<LayerEntry['layer'] | null>(null);

  const closeExpanded = useCallback(() => setExpandedLayer(null), []);

  useEffect(() => {
    if (!expandedLayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExpanded();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [expandedLayer, closeExpanded]);

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

  const expandedItem = expandedLayer
    ? layers.find((l) => l.layer === expandedLayer)
    : undefined;

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-fg-muted">
        AI visibility flows through five causal layers. Weak upstream layers cap downstream scores.
        Click <Maximize2 className="inline h-3 w-3 align-text-bottom mx-0.5" aria-hidden /> on a
        layer to see full criteria and scoring breakdown.
        {scoringMeta.layers.presence && (
          <span className="block mt-1 text-fg-subtle">
            {scoringMeta.offSitePresenceReport
              ? 'Presence includes a live off-site probe (Reddit, reviews, community platforms).'
              : 'Presence scores linked profiles on your site — run a deep presence scan for live platform data.'}
          </span>
        )}
      </p>

      <div className="flex flex-col gap-2 sm:hidden min-w-0">
        {layers.map((item, index) => (
          <div key={item.layer} className="min-w-0">
            <LayerCard
              item={item}
              bottleneckDim={bottleneckDim}
              dimensions={dimensions}
              layerEvidence={scoringMeta.layerEvidence}
              scoringMeta={scoringMeta}
              onExpand={() => setExpandedLayer(item.layer)}
            />
            {index < layers.length - 1 && (
              <div className="flex justify-center py-1 text-fg-subtle" aria-hidden>
                <ChevronDown className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {layers.map((item) => (
          <LayerCard
            key={item.layer}
            item={item}
            bottleneckDim={bottleneckDim}
            dimensions={dimensions}
            layerEvidence={scoringMeta.layerEvidence}
            scoringMeta={scoringMeta}
            onExpand={() => setExpandedLayer(item.layer)}
          />
        ))}
      </div>

      {expandedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="layer-expand-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={closeExpanded}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[min(90vh,900px)] overflow-y-auto rounded-xl border border-border shadow-xl bg-bg">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-bg/95 backdrop-blur-sm">
              <h3 id="layer-expand-title" className="text-sm font-semibold text-fg">
                {LAYER_LABELS[expandedItem.layer]} layer
              </h3>
              <button
                type="button"
                onClick={closeExpanded}
                className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <LayerCardShell item={expandedItem} className="border-0 shadow-none">
                <LayerCardBody
                  item={expandedItem}
                  bottleneckDim={bottleneckDim}
                  dimensions={dimensions}
                  layerEvidence={scoringMeta.layerEvidence}
                  scoringMeta={scoringMeta}
                  expanded
                  onCollapse={closeExpanded}
                />
              </LayerCardShell>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
