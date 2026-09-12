'use client';

/** Two mini sparklines: GEO audit score and AI citation visibility. */
export function DualTrendSparkline({
  scoreTrend,
  visibilityTrend,
  width = 160,
  height = 36,
  className,
}: {
  scoreTrend: number[];
  visibilityTrend: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const hasScore = scoreTrend.length >= 2;
  const hasVisibility = visibilityTrend.length >= 2;
  const halfH = Math.floor((height - 4) / 2);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Trends</span>
      </div>
      <div className="space-y-1">
        <SparklineRow
          label="Site score"
          scores={scoreTrend}
          width={width}
          height={halfH}
          strokeClass="text-accent"
          dashed={!hasScore}
        />
        <SparklineRow
          label="AI citations"
          scores={visibilityTrend}
          width={width}
          height={halfH}
          strokeClass="text-success"
          dashed={!hasVisibility}
        />
      </div>
    </div>
  );
}

function SparklineRow({
  label,
  scores,
  width,
  height,
  strokeClass,
  dashed,
}: {
  label: string;
  scores: number[];
  width: number;
  height: number;
  strokeClass: string;
  dashed: boolean;
}) {
  const latest = scores.length > 0 ? scores[scores.length - 1] : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-fg-subtle w-[72px] shrink-0">{label}</span>
      <svg width={width - 72} height={height} className={strokeClass}>
        {dashed || scores.length < 2 ? (
          <line
            x1={0}
            y1={height / 2}
            x2={width - 72}
            y2={height / 2}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.4}
          />
        ) : (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={buildPoints(scores, width - 72, height)}
          />
        )}
      </svg>
      {latest != null && (
        <span className="text-[10px] tabular-nums text-fg-muted w-6 text-right">{latest}</span>
      )}
    </div>
  );
}

function buildPoints(scores: number[], width: number, height: number): string {
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min || 1;
  const step = width / (scores.length - 1);
  return scores
    .map((s, i) => {
      const x = i * step;
      const y = height - ((s - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
}

export function summarizeDualTrend(scoreTrend: number[], visibilityTrend: number[]): string | null {
  if (scoreTrend.length < 2 && visibilityTrend.length < 2) return null;

  const scoreDelta =
    scoreTrend.length >= 2 ? scoreTrend[scoreTrend.length - 1]! - scoreTrend[0]! : 0;
  const visDelta =
    visibilityTrend.length >= 2
      ? visibilityTrend[visibilityTrend.length - 1]! - visibilityTrend[0]!
      : 0;

  const parts: string[] = [];

  if (scoreTrend.length >= 2) {
    if (scoreDelta > 3) parts.push(`Site score up ${scoreDelta} points`);
    else if (scoreDelta < -3) parts.push(`Site score down ${Math.abs(scoreDelta)} points`);
    else parts.push('Site score steady');
  }

  if (visibilityTrend.length >= 2) {
    if (visDelta > 5) parts.push(`AI citations improving (+${visDelta}%)`);
    else if (visDelta < -5) parts.push(`AI citations dropped (${visDelta}%)`);
    else if (scoreDelta > 3 && Math.abs(visDelta) <= 5) {
      parts.push('but AI citations flat — on-site fixes may not be visible to ChatGPT yet');
    } else {
      parts.push('AI citations steady');
    }
  }

  if (parts.length === 0) return null;
  return parts.join(', ') + '.';
}
