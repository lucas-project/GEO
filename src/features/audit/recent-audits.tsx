'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { formatDate } from '@/lib/utils';
import type { SiteAuditGroup } from '@modules/geo-audit';

const SITES_PER_PAGE = 10;

interface SiteGroupsResponse {
  groups: SiteAuditGroup[];
  page: number;
  pageSize: number;
  totalSites: number;
  totalPages: number;
  hasMore: boolean;
}

export function RecentAudits() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<SiteGroupsResponse>({
    queryKey: ['recent-audits', 'grouped', page],
    queryFn: () =>
      api.get(`/api/geo-audit?grouped=1&page=${page}&pageSize=${SITES_PER_PAGE}`),
    refetchInterval: 5000,
  });

  const siteGroups = data?.groups ?? [];
  const totalSites = data?.totalSites ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const hasMore = data?.hasMore ?? false;
  const canGoPrev = page > 0;
  const rangeStart = totalSites === 0 ? 0 : page * SITES_PER_PAGE + 1;
  const rangeEnd = Math.min((page + 1) * SITES_PER_PAGE, totalSites);

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (siteGroups.length === 0 && page === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted text-center">No audits yet. Run your first audit above.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {siteGroups.map((group) => {
          const { latest } = group;
          return (
            <Card
              key={group.siteKey}
              className="p-4 hover:border-accent/40 hover:bg-bg-subtle transition-colors"
            >
              <div className="flex items-center gap-4">
                <Link
                  href={`/audit/${latest.id}`}
                  className="flex flex-1 items-center gap-4 min-w-0"
                >
                  <ScoreGauge score={latest.overallScore} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-fg truncate block">
                      {group.displayHost}
                    </span>
                    <div className="text-xs text-fg-subtle mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        {group.auditCount} audit{group.auditCount === 1 ? '' : 's'}
                      </span>
                      <span className="text-fg-subtle/40">·</span>
                      <span className="capitalize">{latest.status}</span>
                      <span className="text-fg-subtle/40">·</span>
                      <span>Latest {formatDate(latest.createdAt)}</span>
                    </div>
                  </div>
                </Link>
                {group.monitored && <MonitoredBadge href="/monitor" />}
                <Link
                  href={`/audit/${latest.id}`}
                  className="shrink-0 text-fg-subtle hover:text-fg transition-colors"
                  aria-label={`View latest audit for ${group.displayHost}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-fg-subtle">
            Showing {rangeStart}–{rangeEnd} of {totalSites} sites
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canGoPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-xs text-fg-muted tabular-nums px-1">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
