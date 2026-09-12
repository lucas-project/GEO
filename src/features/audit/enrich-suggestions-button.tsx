'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { GeoAuditResult } from '@modules/geo-audit';
import { countSimulationPrompts } from '@modules/geo-audit';
import { GenerateSimulationQuestions } from '@/features/simulate/generate-simulation-questions';

interface EnrichSuggestionsButtonProps {
  auditId: string;
  missingPrompts: boolean;
  missingCompetitors: boolean;
}

export function EnrichSuggestionsButton({
  auditId,
  missingPrompts,
  missingCompetitors,
}: EnrichSuggestionsButtonProps) {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState<{
    prompts: number;
    competitors: number;
    auditUrl?: string;
  } | null>(null);

  const stillNeeded = missingPrompts || missingCompetitors;

  const handleCompleted = async () => {
    await queryClient.refetchQueries({ queryKey: ['geo-audit', auditId] });
    const refreshed = queryClient.getQueryData<{ audit: GeoAuditResult }>(['geo-audit', auditId]);
    const hasPrompts = countSimulationPrompts(refreshed?.audit.scoringMeta?.suggestedSimulationPrompts) > 0;
    const hasCompetitors = Boolean(refreshed?.audit.scoringMeta?.suggestedCompetitors?.length);

    if (!hasPrompts && !hasCompetitors) return;

    setSuccess({
      prompts: countSimulationPrompts(refreshed?.audit.scoringMeta?.suggestedSimulationPrompts),
      competitors: refreshed?.audit.scoringMeta?.suggestedCompetitors?.length ?? 0,
      auditUrl: refreshed?.audit.url,
    });
  };

  if (!stillNeeded && !success) return null;

  if (!stillNeeded && success) {
    return (
      <div className="mb-6 rounded-xl border border-success/30 bg-success/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-fg">AI questions and competitors added</p>
              <p className="text-xs text-fg-muted mt-1">
                {success.prompts > 0 && `${success.prompts} simulation questions`}
                {success.prompts > 0 && success.competitors > 0 && ' · '}
                {success.competitors > 0 && `${success.competitors} competitors`}
                {' '}— see your improvement plan above.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {success.prompts > 0 && (
              <Link
                href={`/simulate?batch=1&auditId=${auditId}`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Test in Simulate
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {success.competitors > 0 && success.auditUrl && (
              <Link
                href={`/competitors?target=${encodeURIComponent(success.auditUrl)}`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Open Compare
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-bg-elevated p-4 space-y-3">
      <p className="text-sm text-fg-muted">
        This audit was created before personalized AI questions and competitor suggestions were
        available. Choose question types below, then generate them to unlock Simulate, Compare, and
        your improvement plan.
      </p>
      <GenerateSimulationQuestions auditId={auditId} onCompleted={handleCompleted} />
    </div>
  );
}
