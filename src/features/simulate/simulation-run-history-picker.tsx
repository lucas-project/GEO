'use client';

import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import type { VisibilityCheckSummary } from '@/components/geo/visibility-check-results';

interface SimulationRunHistoryPickerProps {
  runs: VisibilityCheckSummary[];
  selectedCheckedAt: string | null;
  onSelect: (checkedAt: string | null) => void;
  className?: string;
}

export function SimulationRunHistoryPicker({
  runs,
  selectedCheckedAt,
  onSelect,
  className,
}: SimulationRunHistoryPickerProps) {
  if (runs.length <= 1) return null;

  const activeAt = selectedCheckedAt ?? runs[0]?.checkedAt ?? null;

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted/20 p-2', className)}>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <History className="w-3.5 h-3.5 text-fg-muted" />
        <span className="text-[11px] font-medium text-fg-muted">
          Past batch runs ({runs.length})
        </span>
      </div>
      <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {runs.map((run, index) => {
          const isLatest = index === 0;
          const isSelected = run.checkedAt === activeAt;
          return (
            <li key={run.checkedAt}>
              <button
                type="button"
                onClick={() => onSelect(isLatest ? null : run.checkedAt)}
                className={cn(
                  'w-full text-left rounded-md px-2 py-1.5 text-[11px] transition-colors',
                  isSelected
                    ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25'
                    : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {formatDate(run.checkedAt)}
                    {isLatest && (
                      <span className="ml-1.5 text-[10px] text-fg-subtle">· latest</span>
                    )}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1 shrink-0 tabular-nums">
                    {run.promptsCiting}/{run.promptsTested} · {run.averageVisibilityScore}
                  </Badge>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
