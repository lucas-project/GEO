'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, PlusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { canonicalPageUrl } from '@/lib/website-url';
import { useAsyncJob } from '@/hooks/use-async-job';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import {
  AuditPagePicker,
  discoverSitePages,
  pageSelectionKey,
  selectedPageUrls,
  type DiscoverResult,
} from './audit-page-picker';

interface AuditMorePagesProps {
  auditId: string;
  siteUrl: string;
  auditedUrls: string[];
}

export function AuditMorePages({ auditId, siteUrl, auditedUrls }: AuditMorePagesProps) {
  const queryClient = useQueryClient();
  const [discovered, setDiscovered] = useState<DiscoverResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discovering, setDiscovering] = useState(false);

  const auditedKeys = new Set(auditedUrls.map((u) => canonicalPageUrl(u, siteUrl)));

  const { enqueue, jobId, job, isRunning, progress } = useAsyncJob<string[], { auditId?: string }>({
    queryKeyPrefix: 'audit-extend-report',
    mutationFn: async (pageUrls) =>
      api.post<{ jobId: string }>(`/api/geo-audit/${auditId}/extend`, { pageUrls }),
    onCompleted: () => {
      setSelected(new Set());
      setDiscovered(null);
      void queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
    },
  });

  const extendLabel = resolveJobProgressLabel({
    jobId,
    status: job?.status,
    progress,
    labels: {
      pending: 'Queued…',
      running: (pct) => (pct < 50 ? 'Crawling selected pages…' : 'Re-scoring audit…'),
      completed: 'Done — refresh to see updated report',
      failed: 'Extend failed',
      cancelled: 'Cancelled',
    },
  });

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverSitePages(siteUrl);
      setDiscovered(result);
      setSelected(new Set());
    } finally {
      setDiscovering(false);
    }
  };

  const startExtend = () => {
    if (!discovered) return;
    const urls = selectedPageUrls(discovered.pages, selected, discovered.url).filter(
      (u) => !auditedKeys.has(u),
    );
    if (urls.length === 0) return;
    enqueue.mutate(urls);
  };

  const newPageCount =
    discovered && selected.size > 0
      ? selectedPageUrls(discovered.pages, selected, discovered.url).filter((u) => !auditedKeys.has(u))
          .length
      : 0;

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2 text-base">
            <PlusCircle className="w-4 h-4 text-accent" />
            Audit more pages
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-fg-muted">
          Find more URLs on this site, select the ones you want, then run Playwright on them. Scores
          and issues update when the job finishes.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={discovering || isRunning}
          onClick={() => void handleDiscover()}
        >
          {discovering ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Finding pages…
            </>
          ) : (
            'Find pages on this site'
          )}
        </Button>

        {discovered && (
          <AuditPagePicker
            siteUrl={siteUrl}
            discovery={{
              ...discovered,
              pages: discovered.pages.filter(
                (p) => !auditedKeys.has(pageSelectionKey(p.url, discovered.url)),
              ),
            }}
            selected={selected}
            onSelectedChange={setSelected}
            disabled={isRunning}
            lockHomepage={false}
            onStart={startExtend}
            startLoading={isRunning}
            startLabel={
              newPageCount > 0
                ? `Audit ${newPageCount} selected page${newPageCount !== 1 ? 's' : ''}`
                : undefined
            }
          />
        )}

        <JobProgress
          jobId={jobId}
          status={job?.status}
          progress={progress}
          error={job?.error}
          label={extendLabel}
        />
      </CardContent>
    </Card>
  );
}
