'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimulateCollapsibleSectionProps {
  title: string;
  summary?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function SimulateCollapsibleSection({
  title,
  summary,
  badge,
  defaultOpen,
  children,
  className,
  id,
}: SimulateCollapsibleSectionProps) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-elevated group',
        className,
      )}
    >
      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2.5 select-none hover:bg-bg-muted/30 transition-colors">
        <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-medium text-fg shrink-0">{title}</span>
        {badge}
        {summary && (
          <span className="text-xs text-fg-muted truncate min-w-0 flex-1 text-right">
            {summary}
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 pt-0 border-t border-border-subtle">{children}</div>
    </details>
  );
}
