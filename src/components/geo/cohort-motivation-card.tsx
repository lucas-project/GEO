'use client';

import { BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BenchmarkLiftChart } from '@/components/geo/benchmark-lift-chart';
import type { BenchmarkInsight } from '@modules/intelligence';

function resolveChartScores(b: BenchmarkInsight): {
  withScore: number;
  withoutScore: number;
} | null {
  let withScore = b.withPatternAvgScore;
  let withoutScore = b.withoutPatternAvgScore;
  const lift = b.liftPoints ?? 0;

  if (withScore != null && withoutScore == null && lift > 0) {
    withoutScore = Math.max(0, Math.round(withScore - lift));
  } else if (withoutScore != null && withScore == null && lift > 0) {
    withScore = Math.round(withoutScore + lift);
  } else if (withScore != null && withoutScore == null) {
    withoutScore = Math.max(0, withScore - 10);
  }

  if (withScore == null || withoutScore == null) return null;
  return { withScore, withoutScore };
}

interface CohortMotivationCardProps {
  insight: BenchmarkInsight;
}

export function CohortMotivationCard({ insight }: CohortMotivationCardProps) {
  const chartScores = resolveChartScores(insight);
  const showChart = chartScores != null && (insight.liftPoints ?? 0) > 0;

  return (
    <Card className="border-accent/20 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-accent" />
          Why this helps
          {insight.youHavePattern === true && (
            <Badge variant="success" className="text-[10px] ml-auto">
              On site
            </Badge>
          )}
          {insight.youHavePattern === false && (
            <Badge variant="warning" className="text-[10px] ml-auto">
              Gap
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-fg leading-relaxed">{insight.summary || insight.message}</p>
        {insight.explanation && (
          <p className="text-xs text-fg-muted leading-relaxed">{insight.explanation}</p>
        )}
        {showChart && chartScores && (
          <BenchmarkLiftChart
            withScore={chartScores.withScore}
            withoutScore={chartScores.withoutScore}
            liftPoints={insight.liftPoints ?? 0}
            sampleCount={insight.sampleCount}
            compact
          />
        )}
        <p className="text-[11px] text-fg-subtle">
          Based on {insight.sampleCount} similar sites in our cohort.
        </p>
      </CardContent>
    </Card>
  );
}
