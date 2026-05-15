'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { formatDate, truncate } from '@/lib/utils';

interface AuditRow {
  id: string;
  url: string;
  overallScore: number;
  status: string;
  createdAt: string;
}

export function RecentAudits() {
  const { data, isLoading } = useQuery<{ audits: AuditRow[] }>({
    queryKey: ['recent-audits'],
    queryFn: () => api.get('/api/geo-audit'),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const audits = data?.audits ?? [];
  if (audits.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted text-center">No audits yet. Run your first audit above.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-2">
      {audits.map((a) => (
        <Link key={a.id} href={`/audit/${a.id}`}>
          <Card className="p-4 hover:border-accent/40 hover:bg-bg-subtle transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <ScoreGauge score={a.overallScore} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-fg truncate">{truncate(a.url, 80)}</div>
                <div className="text-xs text-fg-subtle mt-0.5 flex items-center gap-2">
                  <span className="capitalize">{a.status}</span>
                  <span className="text-fg-subtle/40">·</span>
                  <span>{formatDate(a.createdAt)}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-fg-subtle" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
