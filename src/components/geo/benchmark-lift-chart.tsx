'use client';

import { cn } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

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
  if (score >= 80) return 'hover:bg-success/90';
  if (score >= 60) return 'hover:bg-warning/90';
  return 'hover:bg-danger/90';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

const BAR_TRACK = { compact: 44, default: 52 } as const;

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
  const trackH = compact ? BAR_TRACK.compact : BAR_TRACK.default;
  const max = Math.max(withScore, withoutScore, 1);
  const withH = Math.max(10, Math.round((withScore / max) * 100));
  const withoutH = Math.max(10, Math.round((withoutScore / max) * 100));

  const youInWithGroup = youHavePattern === true;
  const youInWithoutGroup = youHavePattern === false;

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border border-border-subtle bg-bg/60 p-2.5 shrink-0',
        'transition-all duration-200 hover:border-accent/30 hover:bg-bg-subtle/80 hover:shadow-sm',
        className,
      )}
    >
      {yourScore != null && (
        <div className="relative z-10 shrink-0 rounded-md border border-border-subtle bg-bg-elevated px-2 py-1.5 text-center isolate">
          <span className="block text-[9px] leading-tight text-fg-muted">Your overall GEO score</span>
          <span className={cn('text-base font-semibold tabular-nums', scoreTextColor(yourScore))}>
            {yourScore}
          </span>
          <span className="text-[9px] text-fg-subtle"> / 100</span>
        </div>
      )}

      <div className="shrink-0">
        <div className="flex items-end justify-center gap-2 sm:gap-3">
          <BarColumn
            title="Other sites that have this on their pages"
            shortLabel="Has this"
            score={withScore}
            heightPct={withH}
            trackH={trackH}
            isYourGroup={youInWithGroup}
          />
          {liftPoints != null && liftPoints > 0 && (
            <div
              className="flex shrink-0 flex-col items-center justify-end self-stretch pb-1"
              title={`Typical advantage when sites add this: +${liftPoints} pts${liftPercent != null ? ` (+${liftPercent}%)` : ''}`}
            >
              <div className="flex items-center gap-0.5 text-xs font-semibold tabular-nums text-success">
                <TrendingUp className="h-3.5 w-3.5" />
                +{liftPoints}
              </div>
              {liftPercent != null && (
                <span className="text-[9px] text-fg-subtle">+{liftPercent}%</span>
              )}
            </div>
          )}
          <BarColumn
            title="Other sites that do not have this on their pages"
            shortLabel="Missing"
            score={withoutScore}
            heightPct={withoutH}
            trackH={trackH}
            isYourGroup={youInWithoutGroup}
            muted
          />
        </div>

      </div>

      <div className="shrink-0 space-y-1 border-t border-border-subtle pt-2">
        <p className="text-center text-[9px] leading-snug text-fg-subtle">
          Bars = average of {sampleCount} other sites. Not your score.
        </p>
        {youHavePattern !== undefined && (
          <p className="text-center text-[9px] leading-snug text-fg-muted">
            {youInWithGroup ? (
              <>
                Your site <strong className="font-medium text-accent">has</strong> this (left).
              </>
            ) : (
              <>
                Your site <strong className="font-medium text-accent">lacks</strong> this (right).
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function BarColumn({
  title,
  shortLabel,
  score,
  heightPct,
  trackH,
  isYourGroup,
  muted,
}: {
  title: string;
  shortLabel: string;
  score: number;
  heightPct: number;
  trackH: number;
  isYourGroup?: boolean;
  muted?: boolean;
}) {
  const barPx = Math.max(8, Math.round((heightPct / 100) * trackH));

  return (
    <div
      className={cn(
        'flex min-w-[48px] max-w-[76px] flex-1 flex-col items-center gap-1',
        isYourGroup && 'rounded-md bg-accent/5 px-0.5 ring-1 ring-accent/50',
      )}
    >
      <span
        className={cn(
          'text-xs font-semibold tabular-nums leading-none',
          scoreTextColor(score),
          muted && !isYourGroup && 'opacity-75',
        )}
      >
        {score}
      </span>

      <div
        className="flex w-full items-end justify-center px-0.5"
        style={{ height: trackH }}
        title={title}
      >
        <div
          className={cn(
            'w-full cursor-help rounded-t-sm transition-colors duration-200',
            barColor(score),
            barHoverColor(score),
            muted && !isYourGroup && 'opacity-65',
          )}
          style={{ height: barPx }}
        />
      </div>

      <div className="text-center leading-tight">
        <span className="block text-[8px] font-medium text-fg">{shortLabel}</span>
        <span className="block text-[7px] text-fg-subtle">avg</span>
        {isYourGroup && (
          <span className="block text-[7px] font-semibold uppercase tracking-wide text-accent">
            You
          </span>
        )}
      </div>
    </div>
  );
}
