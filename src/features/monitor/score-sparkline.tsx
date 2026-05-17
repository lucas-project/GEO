'use client';

/** Minimal SVG sparkline for score trends. */
export function ScoreSparkline({
  scores,
  width = 80,
  height = 28,
}: {
  scores: number[];
  width?: number;
  height?: number;
}) {
  if (scores.length < 2) {
    return (
      <svg width={width} height={height} className="text-fg-subtle/40">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" />
      </svg>
    );
  }

  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min || 1;
  const step = width / (scores.length - 1);

  const points = scores
    .map((s, i) => {
      const x = i * step;
      const y = height - ((s - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="text-accent">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
