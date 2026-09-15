'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { formatDate } from '@/lib/utils';
import type { SiteAuditGroup } from '@modules/geo-audit';

const SITES_PER_PAGE = 8;

interface SiteGroupsResponse {
  groups: SiteAuditGroup[];
  page: number;
  pageSize: number;
  totalSites: number;
  totalPages: number;
  hasMore: boolean;
}

function RecentAuditsSkeleton() {
  return (
    <div className="space-y-1 py-1">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

export function RecentAudits() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<SiteGroupsResponse>({
    queryKey: ['recent-audits', 'grouped', page],
    queryFn: () =>
      api.get(`/api/geo-audit?grouped=1&page=${page}&pageSize=${SITES_PER_PAGE}`),
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  const siteGroups = data?.groups ?? [];
  const totalSites = data?.totalSites ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const hasMore = data?.hasMore ?? false;
  const canGoPrev = page > 0;
  const rangeStart = totalSites === 0 ? 0 : page * SITES_PER_PAGE + 1;
  const rangeEnd = Math.min((page + 1) * SITES_PER_PAGE, totalSites);
  const latestPreview = siteGroups[0]?.displayHost;

  const headerSummary =
    totalSites === 0
      ? 'No audits yet'
      : [
          `${totalSites} site${totalSites === 1 ? '' : 's'}`,
          latestPreview ? `latest ${latestPreview}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <details className="rounded-lg border border-border-subtle bg-bg-elevated/40 group">
      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2.5 select-none hover:bg-bg-muted/30 transition-colors">
        <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-medium text-fg shrink-0">Recent audits</span>
        <span className="text-xs text-fg-muted truncate min-w-0 flex-1 text-right">{headerSummary}</span>
      </summary>

      <div className="border-t border-border-subtle px-2 pb-2 pt-1">
        {isLoading && !data ? (
          <RecentAuditsSkeleton />
        ) : siteGroups.length === 0 && page === 0 ? (
          <p className="text-xs text-fg-muted text-center py-4 px-2">
            Run an audit above to see history grouped by site.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border-subtle/60">
              {siteGroups.map((group) => {
                const { latest } = group;
                return (
                  <li key={group.siteKey}>
                    <Link
                      href={`/audit/${latest.id}`}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-bg-muted/50 transition-colors min-w-0"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Audit report" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-fg truncate">
                            {group.displayHost}
                          </span>
                          {group.monitored && (
                            <MonitoredBadge href={undefined} className="shrink-0 scale-90 origin-left" />
                          )}
                        </div>
                        <p className="text-[11px] text-fg-subtle truncate mt-0.5">
                          {group.auditCount} audit{group.auditCount === 1 ? '' : 's'}
                          <span className="text-fg-subtle/50 mx-1">·</span>
                          {formatDate(latest.createdAt)}
                          {latest.status === 'partial' && (
                            <>
                              <span className="text-fg-subtle/50 mx-1">·</span>
                              <span className="text-amber-600 dark:text-amber-400 font-medium">Partial</span>
                            </>
                          )}
                          {latest.status === 'failed' && (
                            <>
                              <span className="text-fg-subtle/50 mx-1">·</span>
                              <span className="text-danger font-medium">Failed</span>
                            </>
                          )}
                          {latest.citationProbability != null && (
                            <>
                              <span className="text-fg-subtle/50 mx-1">·</span>
                              Historical citation heuristic (not measured)
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 mt-1 border-t border-border-subtle/60">
                <p className="text-[11px] text-fg-subtle tabular-nums">
                  {rangeStart}–{rangeEnd} of {totalSites}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={!canGoPrev}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </Button>
                  <span className="text-[11px] text-fg-muted tabular-nums px-1">
                    {page + 1}/{totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={!hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
