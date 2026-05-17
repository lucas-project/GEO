'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';

interface BenchmarkInsight {
  insightKind?: string;
  category?: string;
  patternType: string;
  patternKey: string;
  sampleCount: number;
  avgOverallScore?: number;
  yourScore?: number;
  delta?: number;
  liftPoints?: number;
  liftPercent?: number;
  youHavePattern?: boolean;
  message: string;
}

const CATEGORY_ORDER = ['structure', 'content', 'citations', 'platform', 'readability'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structure',
  content: 'Content',
  citations: 'Citations',
  platform: 'Platform',
  readability: 'Readability',
};

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
      label: CATEGORY_LABELS[c] ?? c,
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
            Cohort benchmarks
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-fg-muted">Loading intelligence data…</p>
        ) : benchmarks.length === 0 ? (
          <div className="text-sm text-fg-muted space-y-2">
            <p>
              No cohort benchmarks yet. Each completed audit must be ingested into the intelligence
              graph (happens automatically after audits). Lift stats need several sites sharing the
              same patterns.
            </p>
            <p className="text-xs text-fg-subtle">
              If you already have many audits, run a one-time reindex:{' '}
              <code className="text-[12px] bg-bg-elevated px-1 rounded">POST /api/intelligence/reindex</code>{' '}
              or{' '}
              <code className="text-[12px] bg-bg-elevated px-1 rounded">npx tsx scripts/backfill-intelligence.ts</code>
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.category}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-3">
                  {group.label}
                </h3>
                <ul className="space-y-3">
                  {group.items.map((b) => (
                    <li
                      key={`${b.insightKind ?? 'x'}-${b.patternType}-${b.patternKey}`}
                      className="rounded-lg border border-border bg-bg-elevated p-3 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {b.youHavePattern !== undefined && (
                          <Badge variant={b.youHavePattern ? 'default' : 'outline'}>
                            {b.youHavePattern ? 'You have' : 'Missing'}
                          </Badge>
                        )}
                        {b.liftPoints !== undefined && (
                          <Badge variant="accent">
                            {b.liftPoints >= 0 ? '+' : ''}
                            {b.liftPoints} pts
                            {b.liftPercent !== undefined ? ` (${b.liftPercent}%)` : ''}
                          </Badge>
                        )}
                        <Badge variant="outline">{b.patternType}</Badge>
                        <span className="text-[12px] text-fg-subtle">n={b.sampleCount}</span>
                      </div>
                      <p className="text-fg-muted leading-relaxed">{b.message}</p>
                    </li>
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
