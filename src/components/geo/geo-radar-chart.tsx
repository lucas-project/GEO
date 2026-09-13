'use client';

import { cn } from '@/lib/utils';
import {
  LAYER_LABELS,
  SCORE_LAYERS,
  type LayerScore,
  type ScoreLayer,
} from '@modules/geo-audit';
import type { RefCategoryScores } from '@modules/geo-audit';
import { REF_TIER_LABELS } from '@modules/geo-audit';

const PIPELINE_LABELS: { layer: ScoreLayer; label: string }[] = SCORE_LAYERS.map((layer) => ({
  layer,
  label: LAYER_LABELS[layer],
}));

interface GeoRadarChartProps {
  /** Same five scores as the AI visibility pipeline (effective layer scores). */
  layers: Partial<Record<ScoreLayer, LayerScore>>;
  /** Optional industry A–E rollup (/1000) shown below the radar. */
  refCategories?: RefCategoryScores;
  className?: string;
}

export function GeoRadarChart({ layers, refCategories, className }: GeoRadarChartProps) {
  const size = 200;
  const center = size / 2;
  const maxR = 78;
  const angles = PIPELINE_LABELS.map((_, i) => (Math.PI * 2 * i) / PIPELINE_LABELS.length - Math.PI / 2);

  const scoreFor = (layer: ScoreLayer) => layers[layer]?.effectiveScore ?? 0;

  const point = (i: number, score: number) => {
    const r = (score / 100) * maxR;
    return {
      x: center + r * Math.cos(angles[i]),
      y: center + r * Math.sin(angles[i]),
    };
  };

  const polygon = PIPELINE_LABELS.map((l, i) => {
    const p = point(i, scoreFor(l.layer));
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">Pipeline snapshot</h3>
          <p className="text-[10px] text-fg-muted leading-snug">
            Same five layers as AI visibility pipeline
          </p>
        </div>
        {refCategories && (
          <div className="text-right shrink-0">
            <div className="text-[10px] text-fg-subtle uppercase tracking-wide">
              Industry ref
            </div>
            <div className="text-lg font-semibold tabular-nums text-accent leading-tight">
              {refCategories.refScore1000}
            </div>
            <div className="text-[10px] text-fg-muted">{REF_TIER_LABELS[refCategories.tier]}</div>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[220px] mx-auto"
        role="img"
        aria-label="AI visibility pipeline layer scores"
      >
        {[25, 50, 75, 100].map((level) => {
          const ring = PIPELINE_LABELS.map((_, i) => {
            const p = point(i, level);
            return `${p.x},${p.y}`;
          }).join(' ');
          return (
            <polygon
              key={level}
              points={ring}
              fill="none"
              stroke="currentColor"
              className="text-border-subtle"
              strokeWidth={0.5}
            />
          );
        })}
        {PIPELINE_LABELS.map((l, i) => {
          const outer = point(i, 100);
          return (
            <line
              key={l.layer}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="currentColor"
              className="text-border-subtle"
              strokeWidth={0.5}
            />
          );
        })}
        <polygon points={polygon} className="fill-accent/20 stroke-accent" strokeWidth={1.5} />
        {PIPELINE_LABELS.map((l, i) => {
          const p = point(i, 108);
          return (
            <text
              key={l.layer}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-fg-muted text-[8px]"
            >
              {l.label}
            </text>
          );
        })}
      </svg>

      <ul className="space-y-1 text-[10px] text-fg-muted">
        {PIPELINE_LABELS.map((l) => {
          const ls = layers[l.layer];
          const effective = scoreFor(l.layer);
          const gated = ls && ls.rawScore > effective;
          return (
            <li key={l.layer} className="flex items-center justify-between gap-2">
              <span>{l.label}</span>
              <span className="tabular-nums text-fg font-medium">
                {effective}
                {gated && (
                  <span
                    className="text-fg-subtle font-normal ml-1"
                    title="From this layer's checks only, before earlier pipeline steps apply"
                  >
                    (alone {ls.rawScore})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
