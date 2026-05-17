import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  plainDimensionLabel,
  type Dimension,
  type DimensionScore,
} from '@modules/geo-audit';
import { getAudit } from '@modules/geo-audit/server';
import { getSiteMonitorStatus } from '@modules/monitoring';
import { MonitoredBadge } from '@/components/geo/monitored-badge';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { CitationProbabilityCard } from '@/components/geo/citation-probability-card';
import { BottleneckCallout } from '@/components/geo/bottleneck-callout';
import { CapabilityGraph } from '@/components/geo/capability-graph';
import { IssueList } from '@/features/audit/issue-list';
import { AuditPagesPanel } from '@/features/audit/audit-pages-panel';
import { AuditMorePages } from '@/features/audit/audit-more-pages';
import { BenchmarksPanel } from '@/features/intelligence/benchmarks-panel';
import { WatchSitePrompt } from '@/features/monitor/watch-site-prompt';
import { DimensionBar } from '@/components/geo/dimension-bar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, scoreToLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();

  const monitorStatus = audit.siteId ? await getSiteMonitorStatus(audit.siteId) : null;
  const isMonitored = Boolean(monitorStatus?.monitored && monitorStatus?.monitorEnabled);

  const dimensions = audit.dimensions;
  const dimensionEntries = (Object.keys(DIMENSION_LABELS) as Dimension[]).map((dim) => ({
    dim,
    score: dimensions[dim]?.score ?? 0,
    reasons: dimensions[dim]?.reasons ?? [],
  }));

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
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
          </div>
        </div>

        <div className="shrink-0 flex flex-col sm:flex-row items-center gap-4">
          <div className="text-center">
            <ScoreGauge score={audit.overallScore} size="xl" />
            <div className="mt-2 text-xs uppercase tracking-wider text-fg-muted">
              {scoreToLabel(audit.overallScore)}
            </div>
          </div>
          {audit.scoringMeta && (
            <CitationProbabilityCard scoringMeta={audit.scoringMeta} className="min-w-[200px]" />
          )}
        </div>
      </div>

      {audit.scoringMeta && <BottleneckCallout scoringMeta={audit.scoringMeta} />}

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
              <CapabilityGraph
                scoringMeta={audit.scoringMeta}
                dimensions={dimensions as Record<Dimension, DimensionScore>}
              />
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
              value={
                DIMENSION_LABELS[
                  dimensionEntries.reduce((a, b) => (a.score > b.score ? a : b)).dim as Dimension
                ]
              }
            />
            <Stat
              label="Weakest dimension"
              value={
                DIMENSION_LABELS[
                  dimensionEntries.reduce((a, b) => (a.score < b.score ? a : b)).dim as Dimension
                ]
              }
            />
            {audit.screenshotUrl && (
              <div className="pt-3 border-t border-border-subtle">
                <div className="text-fg-subtle uppercase tracking-wider text-[11px] mb-2">Screenshot</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>All issues ({audit.topIssues.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-fg-muted mb-3">
              Click an issue for a plain-language explanation, affected pages, highlighted code, and what to do next.
            </p>
            <IssueList
              auditId={audit.id}
              issues={audit.topIssues}
              auditUrl={audit.url}
              dimensionLabels={Object.fromEntries(
                DIMENSIONS.map((d) => [d, plainDimensionLabel(d)]),
              )}
              sitePageUrls={
                audit.pageInventory?.pages.map((p) => p.url) ??
                []
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommended fixes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {audit.topFixes.length === 0 ? (
              <p className="text-sm text-fg-muted">No fixes generated.</p>
            ) : (
              audit.topFixes.map((fix) => (
                <div key={fix.id} className="rounded-lg border border-border bg-bg-elevated p-3.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h4 className="text-sm font-medium text-fg">{fix.title}</h4>
                    <Badge
                      variant={fix.effort === 'low' ? 'success' : fix.effort === 'medium' ? 'warning' : 'danger'}
                    >
                      {fix.effort} effort
                    </Badge>
                    {fix.artifactType && <Badge variant="accent">{fix.artifactType}</Badge>}
                  </div>
                  <p className="text-xs text-fg-muted leading-relaxed">{fix.description}</p>
                  {fix.artifactType && (
                    <div className="mt-2 pt-2 border-t border-border-subtle">
                      <Link
                        href={`/optimize?auditId=${audit.id}&type=${fix.artifactType}`}
                        className="text-[12px] text-accent hover:underline"
                      >
                        Generate this fix →
                      </Link>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle uppercase tracking-wider text-[11px]">{label}</span>
      <span className="text-fg font-medium">{value}</span>
    </div>
  );
}
