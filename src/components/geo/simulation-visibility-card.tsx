import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { ScoringMeta } from '@modules/geo-audit';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  VisibilityCheckResults,
} from '@/components/geo/visibility-check-results';
import { formatDate } from '@/lib/utils';

interface SimulationVisibilityCardProps {
  scoringMeta: ScoringMeta;
  auditId: string;
}

export function SimulationVisibilityCard({ scoringMeta, auditId }: SimulationVisibilityCardProps) {
  const check = scoringMeta.simulationVisibilityCheck;
  if (!check) return null;

  const citePct =
    check.promptsTested > 0
      ? Math.round((check.promptsCiting / check.promptsTested) * 100)
      : 0;

  return (
    <Card className="mb-6 border-accent/20 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-accent" />
          AI visibility check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-fg leading-relaxed">
          <span className="font-semibold tabular-nums">
            {check.promptsCiting} of {check.promptsTested}
          </span>{' '}
          discovery questions cite you on simulated AI search
          {citePct > 0 && (
            <span className="text-fg-muted"> ({citePct}% of discovery queries)</span>
          )}
          . Average score{' '}
          <span className="font-semibold tabular-nums">{check.averageVisibilityScore}/100</span>
          {check.brandPromptsTested ? (
            <span className="text-fg-muted text-xs block mt-1">
              {check.brandPromptsTested} brand-specific question
              {check.brandPromptsTested === 1 ? '' : 's'} ran but are excluded from this score.
            </span>
          ) : null}
        </p>
        <p className="text-xs text-fg-muted">Last checked {formatDate(check.checkedAt)}</p>
        <VisibilityCheckResults check={check} auditId={auditId} />
        <Link
          href={`/simulate?batch=1&auditId=${auditId}`}
          className="inline-flex text-xs text-accent hover:underline"
        >
          Open in Simulate for full per-platform responses →
        </Link>
      </CardContent>
    </Card>
  );
}
