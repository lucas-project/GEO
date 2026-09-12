'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, HelpCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BenchmarkLiftChart } from '@/components/geo/benchmark-lift-chart';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import {
  plainCategoryIntro,
  plainCategoryLabel,
} from '@modules/intelligence/benchmark-copy';

interface BenchmarkInsight {
  insightKind?: string;
  category?: string;
  patternType: string;
  patternKey: string;
  sampleCount: number;
  liftPoints?: number;
  liftPercent?: number;
  youHavePattern?: boolean;
  yourScore?: number;
  withPatternAvgScore?: number;
  withoutPatternAvgScore?: number;
  title: string;
  summary: string;
  explanation: string;
  message: string;
}

const CATEGORY_ORDER = ['structure', 'content', 'citations', 'platform', 'readability'] as const;

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

function statusBadge(b: BenchmarkInsight) {
  if (b.youHavePattern === true) {
    return (
      <Badge variant="success" className="shrink-0 text-[9px] px-1.5 py-0">
        On site
      </Badge>
    );
  }
  if (b.youHavePattern === false) {
    return (
      <Badge variant="warning" className="shrink-0 text-[9px] px-1.5 py-0">
        Gap
      </Badge>
    );
  }
  return null;
}

function BenchmarkCard({ insight }: { insight: BenchmarkInsight }) {
  const chartScores = resolveChartScores(insight);
  const showChart = chartScores != null && (insight.liftPoints ?? 0) > 0;

  return (
    <li
      className={cn(
        'flex flex-col rounded-lg border border-border bg-bg-elevated overflow-hidden text-sm',
        'min-w-0 h-full transition-all duration-200',
        'hover:border-accent/40 hover:shadow-md hover:bg-bg-subtle/30',
      )}
    >
      <div className="p-3 flex flex-col flex-1 gap-2 min-h-0">
        <div className="flex items-start justify-between gap-1.5 min-h-[2.5rem]">
          <h4
            className="text-xs font-semibold text-fg leading-snug line-clamp-2 flex-1 min-w-0"
            title={insight.title}
          >
            {insight.title}
          </h4>
          {statusBadge(insight)}
        </div>

        <p className="text-[11px] text-fg-muted leading-snug">{insight.summary}</p>

        {showChart && chartScores && (
          <BenchmarkLiftChart
            compact
            withScore={chartScores.withScore}
            withoutScore={chartScores.withoutScore}
            liftPoints={insight.liftPoints}
            liftPercent={insight.liftPercent}
            youHavePattern={insight.youHavePattern}
            yourScore={insight.yourScore}
            sampleCount={insight.sampleCount}
            className="shrink-0"
          />
        )}
      </div>

      <details className="group border-t border-border-subtle bg-bg/50 mt-auto">
        <summary className="flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium text-accent cursor-pointer list-none hover:bg-bg-subtle/80 transition-colors [&::-webkit-details-marker]:hidden">
          <HelpCircle className="w-3 h-3 shrink-0" />
          <span>More</span>
        </summary>
        <div className="px-2.5 pb-2.5 pt-0 text-[10px] text-fg-muted leading-relaxed max-h-24 overflow-y-auto">
          <p>{insight.explanation}</p>
        </div>
      </details>
    </li>
  );
}

export function BenchmarksPanel({ siteId }: { siteId: string | null | undefined }) {
  const { data, isLoading } = useQuery<{ benchmarks: BenchmarkInsight[] }>({
    queryKey: ['intelligence-benchmarks', siteId],
    queryFn: () => api.get(`/api/intelligence/benchmarks?siteId=${siteId}`),
    enabled: Boolean(siteId),
  });

  const grouped = useMemo(() => {
    const benchmarks = data?.benchmarks ?? [];
    const map = new Map<string, BenchmarkInsight[]>();
    for (const b of benchmarks) {
      const cat = b.category ?? 'content';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      label: plainCategoryLabel(c),
      intro: plainCategoryIntro(c),
      items: map.get(c)!,
    }));
  }, [data?.benchmarks]);

  if (!siteId) return null;

  const benchmarks = data?.benchmarks ?? [];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-accent" />
            How you compare to similar sites
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <LegendItem color="bg-success" label="Strong (80+)" />
          <LegendItem color="bg-warning" label="Fair (60–79)" />
          <LegendItem color="bg-danger" label="Needs work (below 60)" />
        </div>

        <p className="text-xs text-fg-muted leading-relaxed">
          Each card compares <strong className="text-fg font-medium">other websites</strong> in our
          database: average GEO score for sites that have a feature vs. sites that do not. Your site
          is marked separately — the bar numbers are group averages, not your personal score.
        </p>

        {isLoading ? (
          <p className="text-sm text-fg-muted">Loading comparison data…</p>
        ) : benchmarks.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Not enough comparison data yet. Benchmarks appear after several sites have been audited.
          </p>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <section key={group.category}>
                <h3 className="text-sm font-semibold text-fg mb-1">{group.label}</h3>
                <p className="text-xs text-fg-muted mb-3 leading-relaxed">{group.intro}</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none m-0 p-0">
                  {group.items.map((b) => (
                    <BenchmarkCard
                      key={`${b.insightKind ?? 'x'}-${b.patternType}-${b.patternKey}`}
                      insight={b}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-subtle/50 py-2 px-2">
      <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', color)} />
      <span className="text-[11px] text-fg-muted">{label}</span>
    </div>
  );
}
