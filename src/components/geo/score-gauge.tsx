import { cn } from '@/lib/utils';

interface ScoreGaugeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: { dim: 64, stroke: 6, font: 'text-sm' },
  md: { dim: 96, stroke: 8, font: 'text-lg' },
  lg: { dim: 140, stroke: 10, font: 'text-2xl' },
  xl: { dim: 200, stroke: 12, font: 'text-5xl' },
};

function colorFor(score: number | null): string {
  if (score == null) return '#71717a';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

export function ScoreGauge({ score, size = 'md', label, className }: ScoreGaugeProps) {
  const clamped = score == null ? null : Math.max(0, Math.min(100, score));
  const { dim, stroke, font } = sizeMap[size];
  const radius = (dim - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - ((clamped ?? 0) / 100) * circ;
  const color = colorFor(clamped);

  return (
    <div className={cn('relative inline-flex flex-col items-center justify-center', className)}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          stroke="#26262e"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.4s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-semibold tabular-nums', font)} style={{ color }}>
          {clamped ?? '—'}
        </span>
        {label && <span className="text-[12px] uppercase tracking-wider text-fg-subtle mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
