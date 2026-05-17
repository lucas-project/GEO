import { cn } from '@/lib/utils';

interface DimensionBarProps {
  name: string;
  score: number;
  description?: string;
}

function colorFor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-warning';
  return 'bg-danger';
}

export function DimensionBar({ name, score, description }: DimensionBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{name}</span>
        <span className={cn('text-xs tabular-nums font-semibold', clamped >= 80 ? 'text-success' : clamped >= 60 ? 'text-warning' : 'text-danger')}>
          {clamped}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', colorFor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {description && <p className="text-[13px] text-fg-subtle leading-snug">{description}</p>}
    </div>
  );
}
