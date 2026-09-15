'use client';

import { useMemo, useState } from 'react';
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
import type { AuditPageEntry, PageInventory } from '@modules/geo-audit';
import { canReadPage } from '@modules/geo-audit';
import {
  acquisitionBadgeLabel,
  acquisitionBucket,
  acquisitionNextAction,
  acquisitionUserMessage,
  summarizeAcquisition,
  type AcquisitionBucket,
} from '@/features/audit/acquisition-labels';

interface AuditPagesPanelProps {
  auditId: string;
  inventory: PageInventory;
  onUpdated?: (notice: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  seed: 'Homepage',
  sitemap: 'Sitemap',
  internal: 'Internal link',
  llms: 'llms.txt',
  graph: 'Link graph',
};

const FILTER_CHIPS: Array<{ bucket: AcquisitionBucket | 'all'; label: string }> = [
  { bucket: 'all', label: 'All' },
  { bucket: 'observed', label: 'Read successfully' },
  { bucket: 'timeout', label: 'Timed out' },
  { bucket: 'blocked', label: 'Blocked by site' },
  { bucket: 'rate_limited', label: 'Rate limited' },
  { bucket: 'unreachable', label: 'Could not connect' },
  { bucket: 'parse_error', label: 'Could not read content' },
  { bucket: 'not_run', label: 'Not audited yet' },
  { bucket: 'legacy_unknown', label: 'Old result — retry needed' },
];

function AcquisitionDetails({ page }: { page: AuditPageEntry }) {
  const [open, setOpen] = useState(false);
  const detail = page.acquisitionDetail;
  if (!detail && acquisitionBucket(page) === 'observed') return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-[11px] text-accent hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide details' : 'View details'}
      </button>
      {open ? (
        <dl className="mt-1 space-y-0.5 text-[11px] text-fg-muted">
          {detail?.stage ? (
            <div>
              <dt className="inline font-medium text-fg">Stage: </dt>
              <dd className="inline">{detail.stage}</dd>
            </div>
          ) : null}
          {detail?.waitCondition ? (
            <div>
              <dt className="inline font-medium text-fg">Wait condition: </dt>
              <dd className="inline">{detail.waitCondition}</dd>
            </div>
          ) : null}
          {detail?.elapsedMs != null ? (
            <div>
              <dt className="inline font-medium text-fg">Elapsed: </dt>
              <dd className="inline">{detail.elapsedMs} ms</dd>
            </div>
          ) : null}
          {detail?.fetchChannel ? (
            <div>
              <dt className="inline font-medium text-fg">Fetch method: </dt>
              <dd className="inline">{detail.fetchChannel}</dd>
            </div>
          ) : null}
          {detail?.retryCount != null ? (
            <div>
              <dt className="inline font-medium text-fg">Retries: </dt>
              <dd className="inline">{detail.retryCount}</dd>
            </div>
          ) : null}
          {detail?.httpStatus != null ? (
            <div>
              <dt className="inline font-medium text-fg">HTTP：</dt>
              <dd className="inline">{detail.httpStatus}</dd>
            </div>
          ) : null}
          {detail?.finalUrl ? (
            <div>
              <dt className="inline font-medium text-fg">Final URL: </dt>
              <dd className="inline break-all">{detail.finalUrl}</dd>
            </div>
          ) : null}
          {detail?.technicalMessage ? (
            <div>
              <dt className="inline font-medium text-fg">Technical detail: </dt>
              <dd className="inline break-all">{detail.technicalMessage}</dd>
            </div>
          ) : null}
          {detail?.attempts?.length ? (
            <div>
              <dt className="font-medium text-fg">Attempts:</dt>
              <dd className="mt-0.5">
                <ul className="list-disc pl-4">
                  {detail.attempts.map((a, i) => (
                    <li key={`${a.channel}-${i}`}>
                      {a.channel} · {a.outcome} · {a.elapsedMs}ms
                      {a.reasonCode ? ` · ${a.reasonCode}` : ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {acquisitionNextAction(page) ? (
            <div>
              <dt className="inline font-medium text-fg">What to do next: </dt>
              <dd className="inline">{acquisitionNextAction(page)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

export function AuditPagesPanel({ auditId, inventory, onUpdated }: AuditPagesPanelProps) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<AcquisitionBucket | 'all'>('all');
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const summary = useMemo(() => summarizeAcquisition(inventory.pages), [inventory.pages]);
  const visiblePages = useMemo(() => {
    if (filter === 'all') return inventory.pages;
    return inventory.pages.filter((p) => acquisitionBucket(p) === filter);
  }, [filter, inventory.pages]);

  const unaudited = inventory.pages.filter(canReadPage);
  const unauditedUrls = unaudited.map((p) => p.url);

  const persistKey = BACKGROUND_JOB_KEYS.auditExtend(auditId);
  const metaKey = BACKGROUND_JOB_META_KEYS.auditExtend(auditId);

  const { enqueue, jobId, job, isRunning, progress: hookProgress, cancelJob } = useAsyncJob<
    string[],
    { auditId?: string; extension?: { observed: number; failed: number; skipped: Array<{ url: string; reason: string }> } }
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
    clearJobOnComplete: false,
    clearJobOnFailed: false,
    mutationFn: async (pageUrls) => {
      writeBackgroundJobMeta(metaKey, {
        viewHref: `/audit/${auditId}`,
        auditId,
      });
      return api.post<{ jobId: string }>(`/api/geo-audit/${auditId}/extend`, { pageUrls });
    },
    onCompleted: async (result) => {
      writeBackgroundJobMeta(metaKey, null);
      setSelected(new Set());
      await queryClient.refetchQueries({ queryKey: ['geo-audit', auditId], type: 'active' });
      const counts = result?.extension;
      const notice = counts ? `Report updated: ${counts.observed} pages read; ${counts.failed} failed; ${counts.skipped.length} skipped.` : 'Report updated. Review page outcomes below.';
      setCompletionNotice(notice);
      onUpdated?.(notice);
      requestAnimationFrame(() => document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    onFailed: () => {
      writeBackgroundJobMeta(metaKey, null);
      setCompletionNotice(null);
    },
  });

  const { etaLabel } = useBackgroundJobProgress(persistKey);
  const progress = hookProgress;

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
      completed: 'Finished — review page outcomes',
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
            {summary.summaryLine}
          </p>
          <p className="text-xs text-fg-muted mt-0.5" title={GEO_PRIORITY_HINT}>
            GEO priority recommends which unaudited pages to add next — not your audit score.
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-fg-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-border-subtle bg-bg-subtle">
            {FILTER_CHIPS.filter(
              (chip) =>
                chip.bucket === 'all' ||
                summary.buckets[chip.bucket] > 0,
            ).map((chip) => (
              <button
                key={chip.bucket}
                type="button"
                onClick={() => setFilter(chip.bucket)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] border transition-colors',
                  filter === chip.bucket
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-fg-muted hover:bg-bg-elevated',
                )}
              >
                {chip.label}
                {chip.bucket !== 'all' ? ` (${summary.buckets[chip.bucket]})` : ''}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto">
            <ul className="divide-y divide-border-subtle">
              {visiblePages.map((page) => {
                const bucket = acquisitionBucket(page);
                const excluded = bucket !== 'observed';
                const message = acquisitionUserMessage(page);
                const showRawError =
                  page.error &&
                  page.error !== message &&
                  !page.acquisitionDetail?.userMessage;

                return (
                  <li key={page.url} className="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-start gap-3 text-xs">
                    {canReadPage(page) && (
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
                      {excluded && <p
                        className={cn(
                          'mt-0.5',
                          excluded
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-fg-muted',
                        )}
                      >
                        {message}
                      </p>}
                      {showRawError ? <p className="text-danger mt-0.5">{page.error}</p> : null}
                      <AcquisitionDetails page={page} />
                    </div>
                    <div className="flex flex-wrap sm:flex-col sm:items-end gap-1 shrink-0 w-full sm:w-auto">
                      <Badge
                        variant={
                          bucket === 'observed'
                            ? 'success'
                            : bucket === 'not_run'
                              ? 'outline'
                              : 'warning'
                        }
                        title={GEO_PRIORITY_HINT}
                      >
                        {acquisitionBadgeLabel(page)}
                      </Badge>
                      {page.geoScore != null && page.geoScore > 0 && (
                        <GeoPriorityBadge score={page.geoScore} probed={page.probed} />
                      )}
                      {page.audited && bucket === 'observed' ? (
                        <Badge variant="success" title="This page contributed evidence to the score">
                          Included in score
                        </Badge>
                      ) : page.audited ? (
                        <Badge variant="warning" title="GEO tried to read this page but could not use it as evidence">
                          Attempted
                        </Badge>
                      ) : (
                        <Badge variant="outline">{bucket === 'not_run' ? 'Not attempted' : 'Attempted'}</Badge>
                      )}
                      <Badge variant="outline" title={SOURCE_LABELS[page.source]}>
                        {SOURCE_LABELS[page.source]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {(unaudited.length > 0 || jobId) && (
            <div className="sticky bottom-0 px-4 py-3 border-t border-border bg-bg-subtle space-y-2">
              <p className="text-[13px] text-fg-muted">
                Add unread pages or retry failed pages. Only successfully read content contributes to the score.
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
                  `${inventory.pages.some(p => selected.has(p.url) && acquisitionBucket(p) !== 'not_run') ? 'Retry / add' : 'Add'} selected pages (${selected.size})`
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
                cancelLabel={job?.status === 'failed' || job?.status === 'cancelled' || job?.status === 'completed' ? 'Dismiss' : 'Stop'}
                onCancel={() => void cancelJob()}
              />
              {completionNotice ? (
                <div role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-fg">
                  <p className="font-medium text-success">Report updated</p>
                  <p className="mt-1 text-fg-muted">{completionNotice}</p>
                  <button type="button" className="mt-1 text-accent hover:underline" onClick={() => document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    View updated report summary
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
