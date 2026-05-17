'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { useAsyncJob } from '@/hooks/use-async-job';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import {
  AuditPagePicker,
  defaultHomepageSelection,
  discoverSitePages,
  selectedPageUrls,
  type DiscoverResult,
} from './audit-page-picker';

const STORAGE_KEY = 'geo:audit-job';

interface AuditJobResult {
  auditId?: string;
}

export function AuditEntry() {
  const router = useRouter();
  const { targetUrl, setTargetUrl, registerCompletedAudit } = useWorkspaceTarget();
  const submittedUrlRef = useRef('');

  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoverResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { enqueue, mutate, jobId, job, jobQuery, isRunning, progress } = useAsyncJob<
    { url: string; pageUrls?: string[]; maxPages?: number },
    AuditJobResult
  >({
    queryKeyPrefix: 'job',
    persistKey: STORAGE_KEY,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (payload) => api.post<{ jobId: string }>('/api/geo-audit', payload),
    onCompleted: (result) => {
      if (result?.auditId) {
        registerCompletedAudit(result.auditId, submittedUrlRef.current);
        router.push(`/audit/${result.auditId}`);
      }
    },
  });

  const progressLabel = resolveJobProgressLabel({
    jobId,
    status: job?.status,
    progress,
    isQueryPending: jobQuery.isPending,
    isQueryError: jobQuery.isError,
    labels: {
      pending: 'Waiting in queue…',
      running: (pct) =>
        pct < 50
          ? 'Crawling pages…'
          : pct < 78
            ? 'Extracting content…'
            : pct < 88
              ? 'Scoring dimensions…'
              : pct < 96
                ? 'Generating narrative…'
                : 'Saving report…',
      completed: 'Complete — redirecting…',
      failed: 'Audit failed',
      cancelled: 'Cancelled',
    },
  });

  const findPages = async () => {
    if (!targetUrl.trim()) return;
    setDiscovering(true);
    setDiscoverError(null);
    setDiscovered(null);
    try {
      const result = await discoverSitePages(targetUrl.trim());
      setDiscovered(result);
      setSelected(defaultHomepageSelection(result));
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : 'Could not discover pages');
    } finally {
      setDiscovering(false);
    }
  };

  const startAudit = () => {
    if (!targetUrl.trim() || !discovered) return;
    submittedUrlRef.current = targetUrl.trim();
    const pageUrls = selectedPageUrls(discovered.pages, selected, discovered.url);
    mutate({
      url: targetUrl.trim(),
      pageUrls,
      maxPages: pageUrls.length,
    });
  };

  const startHomepageOnly = () => {
    if (!targetUrl.trim()) return;
    submittedUrlRef.current = targetUrl.trim();
    mutate({ url: targetUrl.trim() });
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5" />
            Target URL
          </label>
          <p className="text-[13px] text-fg-muted mt-1 mb-2">
            Find pages on your site, tick the ones you want, then start the audit.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={targetUrl}
              onChange={(e) => {
                setTargetUrl(e.target.value);
                setDiscovered(null);
                setSelected(new Set());
              }}
              placeholder="example.com"
              disabled={isRunning || discovering}
              autoFocus
              className="flex-1 min-w-[200px]"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!targetUrl.trim() || discovering || isRunning}
              onClick={() => void findPages()}
            >
              {discovering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finding pages…
                </>
              ) : (
                'Find pages'
              )}
            </Button>
          </div>
        </div>

        {discovered && (
          <AuditPagePicker
            siteUrl={targetUrl}
            discovery={discovered}
            selected={selected}
            onSelectedChange={setSelected}
            disabled={isRunning}
            onStart={startAudit}
            startLoading={isRunning}
          />
        )}

        {!discovered && (
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-fg-muted"
            disabled={!targetUrl.trim() || isRunning || discovering}
            onClick={startHomepageOnly}
          >
            Skip page picker — audit homepage only
          </Button>
        )}
      </div>

      {discoverError && (
        <div className="mt-3 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
          {discoverError}
        </div>
      )}

      {enqueue.error && (
        <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
          {(enqueue.error as Error).message}
        </div>
      )}

      <JobProgress
        jobId={jobId}
        status={job?.status}
        progress={progress}
        error={job?.error}
        label={progressLabel}
        failedHint="The site may require more time or the crawler was blocked. Try again or check the URL."
      />
    </Card>
  );
}
