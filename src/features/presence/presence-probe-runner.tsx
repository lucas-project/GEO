'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Globe,
  Loader2,
  Download,
  ExternalLink,
  AlertCircle,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import { OffSiteInfluencePanel } from '@/components/geo/off-site-influence-panel';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { auditMatchesWorkspaceUrl } from '@/features/workspace/audit-first-gate';
import { SiteKeywordChips } from '@/features/workspace/site-keyword-chips';
import { brandMismatchMessage } from '@/lib/brand-url-match';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { toJson, enforcePresenceEvidence, hasVerifiedProfile } from '@modules/off-site-presence';
import type { OffSitePresenceReport, PlatformId } from '@modules/off-site-presence';
import { PLATFORM_IDS } from '@modules/off-site-presence';
import { PLATFORM_LABELS } from '@modules/brand-presence';
import type { GeoAuditResult } from '@modules/geo-audit';
import { usePresenceProbe } from './presence-probe-context';

function platformLabel(id: PlatformId): string {
  if (id === 'site_search') return 'Web search';
  return PLATFORM_LABELS[id as keyof typeof PLATFORM_LABELS] ?? id;
}

function PresenceCompactSummary({
  auditId,
  scannedAt,
}: {
  report: OffSitePresenceReport;
  auditId: string | null;
  scannedAt?: string;
}) {
  return (
    <Card className="border-accent/20 bg-accent/5">
      <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg">
            Off-site influence:{' '}
            <span className="font-semibold">Insufficient evidence</span>
            <Badge variant="outline" className="ml-2">
              Not rated
            </Badge>
          </p>
          {scannedAt && (
            <p className="text-[12px] text-fg-subtle mt-1">Last scanned {formatDate(scannedAt)}</p>
          )}
        </div>
        {auditId && (
          <a
            href={`/audit/${auditId}`}
            className="text-[13px] text-accent hover:underline flex items-center gap-1"
          >
            See full breakdown on your audit report
            <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

/** Actionable gaps — profiles, threads, recommendations not surfaced on the audit summary. */
function PresenceActionPlan({ report, auditId }: { report: OffSitePresenceReport; auditId: string | null }) {
  const missingPlatforms = (PLATFORM_IDS as readonly PlatformId[])
    .map((id) => ({ id, result: report.platforms[id] }))
    .filter(({ result }) => result && hasVerifiedProfile(result) && result.status === 'unclaimed')
    .slice(0, 6);

  const topRedditPosts = (report.engagement?.redditDisplayPosts ?? report.engagement?.redditTopPosts ?? []).slice(0, 4);

  const topRecs = (report.recommendations ?? [])
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
    })
    .slice(0, 4);

  const hasActions = missingPlatforms.length > 0 || topRedditPosts.length > 0 || topRecs.length > 0;
  if (!hasActions) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">Your action plan</h2>
        {auditId && (
          <a
            href={`/audit/${auditId}`}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            View audit report
            <ArrowRight className="w-3 h-3" />
          </a>
        )}
      </div>
      <p className="text-[13px] text-fg-subtle -mt-2">
        Concrete steps to improve how AI search engines see your brand beyond your website.
      </p>

      {missingPlatforms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="w-4 h-4 text-warning" />
              Profiles to claim or complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingPlatforms.map(({ id, result }) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
              >
                <div>
                  <span className="text-sm font-medium text-fg">{platformLabel(id)}</span>
                  <Badge
                    variant={result?.status === 'unclaimed' ? 'warning' : 'outline'}
                    className="ml-2"
                  >
                    {result?.status === 'unclaimed' ? 'Unclaimed' : 'Incomplete'}
                  </Badge>
                </div>
                {result?.url && (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    Open
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {topRedditPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-accent" />
              Threads worth joining
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topRedditPosts.map((post, i) => (
              <div key={i} className="rounded-lg border border-border bg-bg-elevated p-3 space-y-1">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-fg hover:text-accent transition-colors flex items-start gap-1.5 group"
                >
                  <span className="truncate leading-snug">{post.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
                <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
                  {post.subreddit && <span className="font-mono">{post.subreddit}</span>}
                  {post.upvotes > 0 && <span>{post.upvotes} upvotes</span>}
                  {post.comments > 0 && <span>{post.comments} comments</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {topRecs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Priority recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topRecs.map((rec, i) => (
              <div key={i} className="rounded-lg border border-border bg-bg-elevated p-3 flex items-start gap-2">
                <Badge variant={rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'outline'}>
                  {rec.priority}
                </Badge>
                <p className="text-sm text-fg leading-relaxed">{rec.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function PresenceProbeRunner() {
  const searchParams = useSearchParams();
  const [showRefreshForm, setShowRefreshForm] = useState(false);
  const {
    targetUrl,
    setTargetUrl,
    targetBrand,
    setTargetBrand,
    siteKeywords,
    siteKeywordSuggestions,
    siteKeywordsLoading,
    siteKeywordsError,
    toggleSiteKeyword,
    refreshSiteKeywords,
    lastAuditId,
    lastAuditForUrl,
  } = useWorkspaceTarget();

  const {
    report,
    resultError,
    failedError,
    isInterrupted,
    isRunning,
    jobId,
    job,
    jobQuery,
    progress,
    startProbe,
    cancelProbe,
  } = usePresenceProbe();

  const auditMatches = Boolean(
    lastAuditId && auditMatchesWorkspaceUrl(targetUrl, lastAuditForUrl),
  );

  const { data: auditData } = useQuery<{ audit: GeoAuditResult }>({
    queryKey: ['presence-audit', lastAuditId],
    enabled: auditMatches && Boolean(lastAuditId),
    queryFn: () => api.get(`/api/geo-audit/${lastAuditId}`),
    staleTime: 5 * 60 * 1000,
  });

  const auditScan = auditData?.audit?.scoringMeta?.offSitePresenceReport ?? null;
  const auditScannedAt = auditData?.audit?.scoringMeta?.offSitePresenceScannedAt;
  const hasAuditScan = Boolean(auditMatches && auditScan);

  const fromFreshProbe = Boolean(
    report && auditScan && report.meta.scannedAt !== auditScan.meta.scannedAt,
  );

  /** When audit already has a scan and user hasn't run a newer probe, show actions only. */
  const showAuditOnlyView = hasAuditScan && !showRefreshForm && !isRunning && !fromFreshProbe;

  const selectedReport: OffSitePresenceReport | null = fromFreshProbe
    ? report
    : auditScan ?? report ?? null;
  const displayReport = selectedReport ? enforcePresenceEvidence(selectedReport) : null;

  const showFullPanel = Boolean(displayReport && !showAuditOnlyView);
  const showProbeForm = !hasAuditScan || showRefreshForm || isRunning;

  useEffect(() => {
    const fromQuery = searchParams.get('url')?.trim();
    if (fromQuery) setTargetUrl(fromQuery);
  }, [searchParams, setTargetUrl]);

  const progressStatus = job?.status ?? (failedError ? 'failed' : undefined);
  const showJobProgress = Boolean(jobId) || Boolean(failedError);

  const progressLabel = resolveJobProgressLabel({
    jobId: showJobProgress ? jobId ?? 'stored' : null,
    forceShow: Boolean(failedError),
    status: progressStatus,
    progress,
    isQueryPending: jobQuery.isPending,
    isQueryError: jobQuery.isError,
    labels: {
      running: (pct) =>
        job?.statusMessage ? job.statusMessage : `Scanning off-site presence… ${pct}%`,
      completed: displayReport ? 'Scan complete' : 'Scan complete — loading results…',
      failed: isInterrupted ? 'Scan interrupted' : 'Scan failed',
      cancelled: 'Scan cancelled',
    },
  });

  const showCompletedWithoutReport =
    Boolean(jobId) &&
    job?.status === 'completed' &&
    !displayReport &&
    !isRunning &&
    !jobQuery.isPending;

  const brandMismatch = brandMismatchMessage(targetBrand, targetUrl);

  const downloadJson = () => {
    if (!displayReport) return;
    const blob = new Blob([toJson(displayReport)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `presence-${displayReport.meta.domain}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {showAuditOnlyView && auditScan && (
        <Card className="p-5 border-accent/20 bg-accent/5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium text-fg">
                We already scanned off-site presence for this site
                {auditScannedAt ? ` on ${formatDate(auditScannedAt)}` : ''}.
              </p>
              <p className="text-[13px] text-fg-muted leading-relaxed">
                Here&apos;s what to do next — claim missing profiles, join relevant discussions, and close
                community gaps. No need to run the scan again unless you want fresh data.
              </p>
            </div>
          </div>
        </Card>
      )}

      {showProbeForm && (
        <Card className="p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-[13px] text-fg-subtle leading-relaxed">
              {hasAuditScan
                ? 'Run a fresh scan if your profiles or community presence may have changed since your last audit.'
                : 'Find where your brand is missing on Reddit, reviews, and forums — then we update your audit score with what we find.'}
            </p>
            {hasAuditScan && showRefreshForm && (
              <button
                type="button"
                onClick={() => setShowRefreshForm(false)}
                className="text-[12px] text-fg-subtle hover:text-fg"
              >
                ← Back to action plan
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-fg-muted uppercase tracking-wider">
                Website URL
              </label>
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Same as workspace bar — example.com"
                disabled={isRunning}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-fg-muted uppercase tracking-wider">
                Brand name (optional)
              </label>
              <Input
                value={targetBrand}
                onChange={(e) => setTargetBrand(e.target.value)}
                placeholder="Auto-detected from site"
                disabled={isRunning}
                className="mt-1"
              />
              {brandMismatch && (
                <p className="text-[11px] text-warning mt-1 leading-snug">{brandMismatch}</p>
              )}
            </div>
          </div>
          <SiteKeywordChips
            keywords={siteKeywordSuggestions}
            selectedTerms={siteKeywords}
            loading={siteKeywordsLoading}
            error={siteKeywordsError}
            onToggle={toggleSiteKeyword}
            onRefresh={refreshSiteKeywords}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={startProbe} disabled={isRunning || !targetUrl.trim()}>
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {hasAuditScan ? 'Run fresh scan' : 'Run presence scan'}
            </Button>
            {displayReport && showFullPanel && (
              <Button variant="secondary" size="sm" onClick={downloadJson}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export JSON
              </Button>
            )}
          </div>
          <JobProgress
            jobId={showJobProgress ? jobId ?? 'stored' : null}
            forceShow={Boolean(failedError)}
            status={isRunning && job?.status === 'completed' ? 'running' : progressStatus}
            progress={progress}
            statusMessage={job?.statusMessage}
            error={job?.error ?? failedError ?? undefined}
            label={progressLabel}
            failedHint={
              isInterrupted
                ? 'The dev server stopped or restarted while this scan was running. Start a new run.'
                : undefined
            }
            onCancel={() => void cancelProbe()}
          />
          {showCompletedWithoutReport && resultError && (
            <p className="text-xs text-warning mt-2">{resultError}</p>
          )}
        </Card>
      )}

      {showAuditOnlyView && auditScan && (
        <button
          type="button"
          onClick={() => setShowRefreshForm(true)}
          className="flex items-center gap-2 text-[13px] text-fg-muted hover:text-fg transition-colors"
        >
          {showRefreshForm ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Run a fresh scan
        </button>
      )}

      {displayReport && (
        <>
          {showAuditOnlyView && (
            <PresenceCompactSummary
              report={displayReport}
              auditId={lastAuditId}
              scannedAt={auditScannedAt ?? displayReport.meta.scannedAt}
            />
          )}
          <PresenceActionPlan report={displayReport} auditId={lastAuditId} />
          {showFullPanel && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-fg">Detailed scan results</h2>
              </div>
              <OffSiteInfluencePanel report={displayReport} scannedAt={displayReport.meta.scannedAt} />
            </div>
          )}
        </>
      )}

      {!displayReport && !showProbeForm && !isRunning && (
        <Card className="p-6 text-center text-sm text-fg-muted">
          Run a presence scan to find off-site gaps for your brand.
        </Card>
      )}
    </div>
  );
}
