'use client';

import { useEffect } from 'react';
import { SiteProfileReview } from '@/features/workspace/site-profile-review';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  plainDimensionLabel,
  type Dimension,
  type DimensionScore,
  type GeoAuditResult,
  countSimulationPrompts,
} from '@modules/geo-audit';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { CitationProbabilityCard } from '@/components/geo/citation-probability-card';
import { BottleneckCallout } from '@/components/geo/bottleneck-callout';
import { CapabilityGraph } from '@/components/geo/capability-graph';
import { OffSitePresenceCard } from '@/components/geo/off-site-presence-card';
import { OffSiteInfluencePanel } from '@/components/geo/off-site-influence-panel';
import { AuditPresenceScan } from '@/features/audit/audit-presence-scan';
import { GeoRadarChart } from '@/components/geo/geo-radar-chart';
import { IssueList } from '@/features/audit/issue-list';
import { AuditPagesPanel } from '@/features/audit/audit-pages-panel';
import { AuditMorePages } from '@/features/audit/audit-more-pages';
import { BenchmarksPanel } from '@/features/intelligence/benchmarks-panel';
import { WatchSitePrompt } from '@/features/monitor/watch-site-prompt';
import { ImprovementPlanPanel } from '@/components/geo/improvement-plan-panel';
import { SimulationVisibilityCard } from '@/components/geo/simulation-visibility-card';
import { EnrichSuggestionsButton } from '@/features/audit/enrich-suggestions-button';
import { DimensionBar } from '@/components/geo/dimension-bar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AuditReportSkeleton } from '@/features/audit/audit-report-skeleton';
import { PENDING_AUDIT_REPORT_KEY } from '@/features/audit/geo-audit-job-context';
import { api, ApiError } from '@/lib/api-client';
import { formatDate, scoreToLabel } from '@/lib/utils';
import type { SiteMonitorStatus } from '@modules/monitoring';

const AUDIT_STALE_MS = 5 * 60 * 1000;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle uppercase tracking-wider text-[11px]">{label}</span>
      <span className="text-fg font-medium">{value}</span>
    </div>
  );
}

function AuditReportContent({ audit }: { audit: GeoAuditResult }) {
  const dimensions = audit.dimensions;
  const readiness = audit.scoringMeta?.readiness;
  const displayedScore = readiness ? readiness.score : audit.overallScore;
  const dimensionEntries = (Object.keys(DIMENSION_LABELS) as Dimension[]).map((dim) => ({
    dim,
    score: dimensions[dim]?.score ?? null,
    reasons: dimensions[dim]?.reasons ?? [],
  }));
  const measuredDimensions = dimensionEntries.filter(
    (entry): entry is typeof entry & { score: number } => entry.score != null,
  );
  const strongestDimension = measuredDimensions.reduce(
    (best, entry) => (!best || entry.score > best.score ? entry : best),
    measuredDimensions[0],
  );
  const weakestDimension = measuredDimensions.reduce(
    (worst, entry) => (!worst || entry.score < worst.score ? entry : worst),
    measuredDimensions[0],
  );

  const { data: monitorStatus } = useQuery<SiteMonitorStatus>({
    queryKey: ['monitor-status', audit.siteId],
    enabled: Boolean(audit.siteId),
    queryFn: () => api.get(`/api/monitor/status?siteId=${audit.siteId}`),
    staleTime: 60_000,
  });

  const isMonitored = Boolean(monitorStatus?.monitored && monitorStatus?.monitorEnabled);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      {audit.siteId && <div className="mb-6"><SiteProfileReview key={audit.siteId} siteId={audit.siteId} /></div>}
      <Link
        href="/audit"
        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to audits
      </Link>

      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1">GEO Report</div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h1 className="text-2xl font-semibold truncate">{audit.url}</h1>
            {isMonitored && <MonitoredBadge />}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <span>{formatDate(audit.createdAt)}</span>
            <span className="text-fg-subtle/40">·</span>
            <a
              href={audit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-accent transition-colors"
            >
              Open page
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-fg-subtle/40">·</span>
            <a
              href={`/api/geo-audit/${audit.id}/report`}
              className="hover:text-accent transition-colors"
            >
              Export report
            </a>
          </div>
          {audit.scoringMeta?.siteProfile && (
            <div className="mt-2 text-xs text-fg-muted">
              Detected entity: <span className="text-fg">{audit.scoringMeta.siteProfile.primaryEntity.name}</span>
              <span className="ml-2 text-fg-subtle">
                ({audit.scoringMeta.siteProfile.confirmationState === 'needs_review' ? 'needs review' : 'draft'})
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col sm:flex-row items-center gap-4">
          <div className="text-center">
            <ScoreGauge score={displayedScore} size="xl" />
            <div className="mt-2 text-xs uppercase tracking-wider text-fg-muted">
              {readiness ? 'Content & technical readiness' : `${scoreToLabel(audit.overallScore)} · historical estimate`}
            </div>
            {readiness ? (
              <div className="mt-1 text-[11px] text-fg-subtle" title="Share of applicable checks with observed evidence">
                {readiness.coverageStatus === 'ready' ? 'Evidence-backed result' : readiness.coverageStatus === 'preliminary' ? 'Preliminary result' : 'Insufficient evidence'} · {Math.round(readiness.coverage * 100)}% coverage
              </div>
            ) : typeof audit.scoringMeta?.coverage === 'number' && (
              <div className="mt-1 text-[11px] text-fg-subtle" title="Share of applicable checks with observed evidence">
                Evidence coverage {Math.round(audit.scoringMeta.coverage * 100)}%
                {audit.scoringMeta.coverage < 0.8 ? ' · limited' : ''}
              </div>
            )}
          </div>
          {audit.scoringMeta && (
            <CitationProbabilityCard scoringMeta={audit.scoringMeta} className="min-w-[200px]" />
          )}
        </div>
      </div>

      {audit.scoringMeta && <BottleneckCallout scoringMeta={audit.scoringMeta} />}

      <ImprovementPlanPanel audit={audit} />

      <EnrichSuggestionsButton
        auditId={audit.id}
        missingPrompts={countSimulationPrompts(audit.scoringMeta?.suggestedSimulationPrompts) === 0}
        missingCompetitors={!audit.scoringMeta?.suggestedCompetitors?.length}
      />

      {audit.scoringMeta?.simulationVisibilityCheck && (
        <SimulationVisibilityCard scoringMeta={audit.scoringMeta} auditId={audit.id} />
      )}

      {audit.pageInventory && audit.pageInventory.pages.length > 0 && (
        <AuditPagesPanel auditId={audit.id} inventory={audit.pageInventory} />
      )}

      <AuditMorePages
        auditId={audit.id}
        siteUrl={audit.url}
        auditedUrls={
          audit.pageInventory?.pages.filter((p) => p.audited).map((p) => p.url) ?? [audit.url]
        }
      />

      {audit.siteId && (
        <WatchSitePrompt
          siteId={audit.siteId}
          url={audit.url}
          defaultPageUrls={
            audit.pageInventory?.pages.filter((p) => p.audited).map((p) => p.url) ?? [audit.url]
          }
        />
      )}
      <BenchmarksPanel siteId={audit.siteId} />

      {audit.narrative && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Executive summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-fg-muted leading-relaxed whitespace-pre-wrap">
            {audit.narrative}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AI visibility pipeline</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden">
            {audit.scoringMeta ? (
              <div className="space-y-4">
                <CapabilityGraph
                  scoringMeta={audit.scoringMeta}
                  dimensions={dimensions as Record<Dimension, DimensionScore>}
                />
                {audit.scoringMeta.offSitePresenceReport ? (
                  <OffSiteInfluencePanel
                    report={audit.scoringMeta.offSitePresenceReport}
                    scannedAt={audit.scoringMeta.offSitePresenceScannedAt}
                  />
                ) : (
                  <>
                    {audit.scoringMeta.presenceSignals && (
                      <OffSitePresenceCard
                        presenceSignals={audit.scoringMeta.presenceSignals}
                        offSiteScore={dimensions.offSitePresence?.score ?? 0}
                        presenceProbe={audit.scoringMeta.presenceProbe}
                      />
                    )}
                    <AuditPresenceScan auditId={audit.id} siteUrl={audit.url} />
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                {dimensionEntries.map(({ dim, score, reasons }) => (
                  <DimensionBar
                    key={dim}
                    name={DIMENSION_LABELS[dim]}
                    score={score}
                    description={reasons[0] ?? DIMENSION_DESCRIPTIONS[dim]}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          {audit.scoringMeta?.layers && (
            <GeoRadarChart
              layers={audit.scoringMeta.layers}
              refCategories={audit.scoringMeta.refCategories}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quick stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {audit.pageInventory && (
                <Stat
                  label="Pages audited"
                  value={`${audit.pageInventory.auditedCount} / ${audit.pageInventory.discoveredCount}`}
                />
              )}
              <Stat label="Issues found" value={String(audit.topIssues.length)} />
              <Stat label="Fixes generated" value={String(audit.topFixes.length)} />
              <Stat
                label="Strongest dimension"
                value={strongestDimension ? DIMENSION_LABELS[strongestDimension.dim] : 'Insufficient evidence'}
              />
              <Stat
                label="Weakest dimension"
                value={weakestDimension ? DIMENSION_LABELS[weakestDimension.dim] : 'Insufficient evidence'}
              />
              {audit.screenshotUrl && (
                <div className="pt-3 border-t border-border-subtle">
                  <div className="text-fg-subtle uppercase tracking-wider text-[11px] mb-2">
                    Screenshot
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={audit.screenshotUrl}
                    alt="Page screenshot"
                    className="w-full rounded border border-border"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <details open={audit.topIssues.length <= 3} className="group">
          <summary className="cursor-pointer list-none">
            <Card className="group-open:rounded-b-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>All issues ({audit.topIssues.length})</span>
                  {audit.topIssues.length > 3 && (
                    <span className="text-xs font-normal text-accent">Expand technical detail</span>
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
          </summary>
          <Card className="rounded-t-none border-t-0">
            <CardContent className="pt-0">
              <p className="text-xs text-fg-muted mb-3">
                Affected pages, code highlights, and fix guidance for each issue.
              </p>
              <IssueList
                auditId={audit.id}
                issues={audit.topIssues}
                auditUrl={audit.url}
                dimensionLabels={Object.fromEntries(
                  DIMENSIONS.map((d) => [d, plainDimensionLabel(d)]),
                )}
                sitePageUrls={audit.pageInventory?.pages.map((p) => p.url) ?? []}
              />
            </CardContent>
          </Card>
        </details>
      </div>
    </div>
  );
}

export function AuditReportView({ auditId }: { auditId: string }) {
  useEffect(() => {
    sessionStorage.removeItem(PENDING_AUDIT_REPORT_KEY);
  }, [auditId]);

  const { data, error, isLoading, isFetching } = useQuery<{ audit: GeoAuditResult }>({
    queryKey: ['geo-audit', auditId],
    queryFn: () => api.get(`/api/geo-audit/${auditId}`),
    staleTime: AUDIT_STALE_MS,
    gcTime: 30 * 60 * 1000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const audit = data?.audit;

  if (isLoading && !audit) {
    return <AuditReportSkeleton />;
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="max-w-6xl mx-auto px-8 py-10">
        <Link
          href="/audit"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to audits
        </Link>
        <Card className="p-8 text-center">
          <p className="text-sm text-fg-muted">Audit not found.</p>
        </Card>
      </div>
    );
  }

  if (!audit) {
    return <AuditReportSkeleton />;
  }

  return (
    <>
      {isFetching && !isLoading && (
        <div className="sticky top-0 z-10 bg-accent/10 border-b border-accent/20 px-4 py-1 text-center text-[11px] text-accent">
          Refreshing report…
        </div>
      )}
      <AuditReportContent audit={audit} />
    </>
  );
}
