'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useAsyncJob } from '@/hooks/use-async-job';
import {
  writeBackgroundJobMeta,
} from '@/features/workspace/background-jobs-context';
import {
  BACKGROUND_JOB_KEYS,
  BACKGROUND_JOB_META_KEYS,
} from '@/lib/background-job-keys';
import { useBackgroundJobProgress } from '@/hooks/use-background-job-progress';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import { GEO_PRIORITY_HINT, GeoPriorityBadge } from '@/components/geo/geo-priority-badge';
import type { PageInventory } from '@modules/geo-audit';

interface AuditPagesPanelProps {
  auditId: string;
  inventory: PageInventory;
}

const SOURCE_LABELS: Record<string, string> = {
  seed: 'Homepage',
  sitemap: 'Sitemap',
  internal: 'Internal link',
  llms: 'llms.txt',
  graph: 'Link graph',
};

export function AuditPagesPanel({ auditId, inventory }: AuditPagesPanelProps) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const unaudited = inventory.pages.filter((p) => !p.audited);
  const unauditedUrls = unaudited.map((p) => p.url);

  const persistKey = BACKGROUND_JOB_KEYS.auditExtend(auditId);
  const metaKey = BACKGROUND_JOB_META_KEYS.auditExtend(auditId);

  const { enqueue, jobId, job, isRunning, progress: hookProgress, cancelJob } = useAsyncJob<
    string[],
    { auditId?: string }
  >({
    queryKeyPrefix: `audit-extend-${auditId}`,
    persistKey,
    background: {
      label: 'Adding pages to audit',
      viewHref: `/audit/${auditId}`,
      hideOnPathPrefix: `/audit/${auditId}`,
      metaStorageKey: metaKey,
      etaUnits: 2,
    },
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (pageUrls) => {
      writeBackgroundJobMeta(metaKey, {
        viewHref: `/audit/${auditId}`,
        auditId,
      });
      return api.post<{ jobId: string }>(`/api/geo-audit/${auditId}/extend`, { pageUrls });
    },
    onCompleted: () => {
      writeBackgroundJobMeta(metaKey, null);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['audit', auditId] });
    },
    onFailed: () => {
      writeBackgroundJobMeta(metaKey, null);
    },
  });

  const { progress: bgProgress, etaLabel } = useBackgroundJobProgress(persistKey);
  const progress = bgProgress ?? hookProgress;

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAllUnaudited = () => {
    setSelected(new Set(unauditedUrls));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const extendLabel = resolveJobProgressLabel({
    jobId,
    status: job?.status,
    progress,
    labels: {
      pending: 'Queued…',
      running: (pct) => (pct < 50 ? 'Crawling selected pages…' : 'Re-scoring audit…'),
      completed: 'Done — refreshing report',
      failed: 'Extend failed',
      cancelled: 'Cancelled',
    },
  });

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-elevated overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-subtle transition-colors"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-medium text-fg">Pages on this site</p>
          <p className="text-xs text-fg-muted mt-0.5" title={GEO_PRIORITY_HINT}>
            {inventory.discoveredCount} discovered · {inventory.auditedCount} audited with Playwright.
            GEO priority recommends which unaudited pages to add next — not your audit score.
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-fg-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border max-h-80 overflow-y-auto">
          <ul className="divide-y divide-border-subtle">
            {inventory.pages.map((page) => (
              <li key={page.url} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                {!page.audited && (
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={selected.has(page.url)}
                    onChange={() => toggle(page.url)}
                    disabled={isRunning}
                    aria-label={`Select ${page.url}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1.5 text-accent hover:underline break-all"
                  >
                    {page.url}
                    <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                  </a>
                  {page.title ? <p className="text-fg-muted mt-0.5 truncate">{page.title}</p> : null}
                  {page.error ? <p className="text-danger mt-0.5">{page.error}</p> : null}
                  {page.observationStatus && page.observationStatus !== 'observed' ? (
                    <p className="text-amber-600 dark:text-amber-400 mt-0.5">
                      Acquisition: {page.observationStatus.replace('_', ' ')}; evidence excluded from score
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {page.geoScore != null && page.geoScore > 0 && (
                    <GeoPriorityBadge score={page.geoScore} probed={page.probed} />
                  )}
                  {page.audited ? (
                    <Badge variant="success">Audited</Badge>
                  ) : (
                    <Badge variant="outline">Discovered</Badge>
                  )}
                  <Badge variant="default">{SOURCE_LABELS[page.source]}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {unaudited.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-bg-subtle space-y-2">
              <p className="text-[13px] text-fg-muted">
                Select discovered pages to crawl with Playwright and include in scoring.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRunning || unaudited.length === 0}
                  onClick={selectAllUnaudited}
                >
                  Select all ({unaudited.length})
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isRunning || selected.size === 0}
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0 || isRunning}
                onClick={() => enqueue.mutate([...selected])}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Auditing…
                  </>
                ) : (
                  `Audit selected pages (${selected.size})`
                )}
              </Button>
              <JobProgress
                active={isRunning}
                jobId={jobId}
                status={job?.status}
                progress={progress}
                error={job?.error}
                label={extendLabel}
                remainingLabel={etaLabel}
                remainingIsEstimate
                cancelLabel="Stop"
                onCancel={() => void cancelJob()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
