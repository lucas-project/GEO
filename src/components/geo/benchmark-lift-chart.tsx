'use client';

import { cn } from '@/lib/utils';
import { Check, TrendingUp } from 'lucide-react';

interface BenchmarkLiftChartProps {
  withScore: number;
  withoutScore: number;
  liftPoints?: number;
  liftPercent?: number;
  youHavePattern?: boolean;
  yourScore?: number;
  sampleCount: number;
  compact?: boolean;
  className?: string;
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-warning';
  return 'bg-danger';
}

function barHoverColor(score: number): string {
  if (score >= 80) return 'hover:bg-success/90 hover:shadow-[0_0_12px_rgba(34,197,94,0.35)]';
  if (score >= 60) return 'hover:bg-warning/90 hover:shadow-[0_0_12px_rgba(245,158,11,0.35)]';
  return 'hover:bg-danger/90 hover:shadow-[0_0_12px_rgba(239,68,68,0.35)]';
}

export function BenchmarkLiftChart({
  withScore,
  withoutScore,
  liftPoints,
  liftPercent,
  youHavePattern,
  yourScore,
  sampleCount,
  compact,
  className,
}: BenchmarkLiftChartProps) {
  const max = Math.max(withScore, withoutScore, yourScore ?? 0, 1);
  const withH = Math.max(8, Math.round((withScore / max) * 100));
  const withoutH = Math.max(8, Math.round((withoutScore / max) * 100));
  const yourH = yourScore != null ? Math.max(8, Math.round((yourScore / max) * 100)) : null;
  const chartH = compact ? 'h-[80px]' : 'h-[100px]';

  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-bg/60 p-2.5 transition-all duration-200',
        'hover:border-accent/30 hover:bg-bg-subtle/80 hover:shadow-sm',
        className,
      )}
    >
      <div className={cn('flex items-end justify-center gap-2 sm:gap-4 mb-2', chartH)}>
        <BarColumn
          label="With"
          score={withScore}
          heightPct={withH}
          highlight={youHavePattern === true}
          tooltip={`Sites with this pattern average ${withScore}/100`}
        />
        {liftPoints != null && liftPoints > 0 && (
          <div
            className="flex flex-col items-center justify-end pb-4 shrink-0 px-0.5 transition-transform duration-200 hover:scale-105"
            title={`${liftPoints} point lift${liftPercent != null ? ` (+${liftPercent}%)` : ''}`}
          >
            <div className="flex items-center gap-0.5 text-success text-xs font-semibold tabular-nums">
              <TrendingUp className="w-3.5 h-3.5" />
              +{liftPoints}
            </div>
            {liftPercent != null && (
              <span className="text-[9px] text-fg-subtle">+{liftPercent}%</span>
            )}
          </div>
        )}
        <BarColumn
          label="Without"
          score={withoutScore}
          heightPct={withoutH}
          highlight={youHavePattern === false}
          muted
          tooltip={`Sites without this pattern average ${withoutScore}/100`}
        />
      </div>

      {yourScore != null && !compact && (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-1 rounded-full bg-bg-muted overflow-hidden max-w-[100px]">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-200',
                barColor(yourScore),
                barHoverColor(yourScore),
              )}
              style={{ width: `${yourH}%` }}
              title={`Your GEO score: ${yourScore}`}
            />
          </div>
          <span className="text-[9px] text-fg-muted tabular-nums">
            You: <strong className="text-fg">{yourScore}</strong>
          </span>
        </div>
      )}

      <p className="text-[9px] text-fg-subtle text-center">{sampleCount} sites compared</p>
    </div>
  );
}

function BarColumn({
  label,
  score,
  heightPct,
  highlight,
  muted,
  tooltip,
}: {
  label: string;
  score: number;
  heightPct: number;
  highlight?: boolean;
  muted?: boolean;
  tooltip: string;
}) {
  return (
    <div
      className="group/col relative flex flex-col items-center justify-end gap-1 min-w-[48px] flex-1 max-w-[72px] h-full"
    >
      <span
        className={cn(
          'text-sm font-semibold tabular-nums leading-none transition-transform duration-200 group-hover/col:scale-110',
          score >= 80 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-danger',
          muted && !highlight && 'opacity-75',
        )}
      >
        {score}
      </span>
      <div className="flex-1 w-full flex flex-col justify-end min-h-[36px] px-0.5">
        <div
          className={cn(
            'w-full rounded-t-md transition-all duration-200 ease-out cursor-default',
            'group-hover/col:scale-[1.03] group-hover/col:-translate-y-0.5',
            barColor(score),
            barHoverColor(score),
            muted && !highlight && 'opacity-65 group-hover/col:opacity-90',
            highlight && 'ring-2 ring-accent ring-offset-1 ring-offset-bg/60',
          )}
          style={{ height: `${heightPct}%`, minHeight: 22 }}
        />
      </div>
      <span className="text-[9px] text-fg-muted text-center leading-none">{label}</span>
      {highlight && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-accent">
          <Check className="w-2.5 h-2.5" />
          You
        </span>
      )}
      <div
        className={cn(
          'pointer-events-none absolute z-10 -top-8 left-1/2 -translate-x-1/2',
          'opacity-0 group-hover/col:opacity-100 transition-opacity duration-150',
          'rounded px-1.5 py-0.5 text-[9px] text-fg bg-bg-elevated border border-border shadow-sm whitespace-nowrap',
        )}
        role="tooltip"
      >
        {tooltip}
      </div>
    </div>
  );
}
