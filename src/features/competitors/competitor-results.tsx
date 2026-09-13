'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CompetitorComparison } from '@modules/competitor-analysis';

function dimLabel(dim: string) {
  return dim
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function hostnameFromUrl(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    try {
      return new URL(u.includes('://') ? u : `https://${u}`).hostname;
    } catch {
      return u;
    }
  }
}

export function CompetitorComparisonResults({ data }: { data: CompetitorComparison }) {
  const { target, gaps, failedCompetitors, candidateRejections, comparisonStatus, createdAt } = data;

  return (
    <div className="space-y-6">
      {comparisonStatus === 'insufficient_candidates' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          No validated competitor sites were available. Add direct competitor URLs to run a comparison; directory and same-site URLs are excluded.
        </div>
      )}
      {candidateRejections && candidateRejections.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-fg-muted">Excluded candidate URLs</p>
          <ul className="mt-1 space-y-1">
            {candidateRejections.map((candidate) => (
              <li key={`${candidate.input}-${candidate.reason}`} className="text-[11px] text-fg-subtle">
                <span className="font-mono text-fg">{candidate.input}</span> — {candidate.reason.replace('_', ' ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failedCompetitors && failedCompetitors.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {failedCompetitors.length} competitor{failedCompetitors.length === 1 ? '' : 's'} could not
            be audited (bad URL, blocked, or unreachable). Results below are for the rest.
          </p>
          <ul className="space-y-1">
            {failedCompetitors.map((f) => (
              <li key={f.url} className="text-[11px] text-fg-muted">
                <span className="font-mono text-fg">{hostnameFromUrl(f.url)}</span>
                {' — '}
                {f.error.split('\n')[0]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your site</CardTitle>
          <p className="text-xs text-fg-muted font-mono mt-1">{new Date(createdAt).toLocaleString()}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">{hostnameFromUrl(target.url)}</span>
            <Badge variant="accent">GEO score {target.overallScore}</Badge>
            <Link
              href={`/audit/${target.auditId}`}
              className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
            >
              Open audit <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <p className="text-[13px] text-fg-muted">
            Compared against {gaps.length} competitor{gaps.length === 1 ? '' : 's'}. Positive overall gap means you lead on combined GEO dimensions.
          </p>
        </CardContent>
      </Card>

      {gaps.map((gap) => (
        <Card key={gap.competitorUrl}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">vs {hostnameFromUrl(gap.competitorUrl)}</CardTitle>
              <Badge variant={gap.overallGap >= 0 ? 'success' : 'danger'}>
                Overall gap {gap.overallGap >= 0 ? '+' : ''}
                {gap.overallGap}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg-muted/40 text-left text-fg-subtle uppercase tracking-wider">
                    <th className="p-2 font-medium">Dimension</th>
                    <th className="p-2 font-medium tabular-nums">You</th>
                    <th className="p-2 font-medium tabular-nums">Them</th>
                    <th className="p-2 font-medium tabular-nums">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {gap.dimensionGaps.map((d) => (
                    <tr key={d.dimension} className="border-b border-border-subtle/60 last:border-0">
                      <td className="p-2 text-fg">{dimLabel(d.dimension)}</td>
                      <td className="p-2 tabular-nums text-fg-muted">{d.target}</td>
                      <td className="p-2 tabular-nums text-fg-muted">{d.competitor}</td>
                      <td
                        className={`p-2 tabular-nums font-medium ${
                          d.gap > 0 ? 'text-success' : d.gap < 0 ? 'text-danger' : 'text-fg-muted'
                        }`}
                      >
                        {d.gap > 0 ? '+' : ''}
                        {d.gap}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DiffList title="Entities you surface more" items={gap.entitiesAhead} empty="None flagged" />
              <DiffList title="Entities they surface more" items={gap.entitiesBehind} empty="None flagged" />
              <DiffList title="Schema types you have & they lack" items={gap.schemaAhead} empty="None" />
              <DiffList title="Schema types they have & you lack" items={gap.schemaBehind} empty="None" />
            </div>

            {(() => {
              const comp = data.competitors.find((c) => c.url === gap.competitorUrl);
              if (!comp) return null;
              return (
                <div className="pt-1">
                  <Link
                    href={`/audit/${comp.auditId}`}
                    className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
                  >
                    Open competitor audit <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DiffList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1.5">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-fg-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {items.map((x) => (
            <Badge key={x} variant="outline">
              {x}
            </Badge>
          ))}
        </ul>
      )}
    </div>
  );
}
