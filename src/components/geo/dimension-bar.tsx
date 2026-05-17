import { cn } from '@/lib/utils';

interface DimensionBarProps {
  name: string;
  score: number;
  description?: string;
  /** Tighter layout for pipeline layer cards */
  compact?: boolean;
}

function colorFor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-warning';
  return 'bg-danger';
}

export function DimensionBar({ name, score, description, compact }: DimensionBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-1.5')}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span
          className={cn(
            'font-medium text-fg truncate min-w-0',
            compact ? 'text-[11px]' : 'text-xs',
          )}
          title={name}
        >
          {name}
        </span>
        <span
          className={cn(
            'tabular-nums font-semibold shrink-0',
            compact ? 'text-[11px]' : 'text-xs',
            clamped >= 80 ? 'text-success' : clamped >= 60 ? 'text-warning' : 'text-danger',
          )}
        >
          {clamped}
        </span>
      </div>
      <div className={cn('rounded-full bg-bg-muted overflow-hidden', compact ? 'h-1' : 'h-1.5')}>
        <div
          className={cn('h-full rounded-full transition-all duration-700', colorFor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {description && (
        <p
          className={cn(
            'text-fg-subtle leading-snug break-words',
            compact ? 'text-[10px] line-clamp-2' : 'text-[13px]',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
