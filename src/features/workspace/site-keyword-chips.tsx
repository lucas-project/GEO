'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SiteKeywordChipsProps {
  keywords: string[];
  loading?: boolean;
  error?: string | null;
  onToggle: (term: string) => void;
  onRefresh?: () => void;
  selectedTerms?: string[];
  className?: string;
}

export function SiteKeywordChips({
  keywords,
  loading,
  error,
  onToggle,
  onRefresh,
  selectedTerms,
  className,
}: SiteKeywordChipsProps) {
  const selected = selectedTerms ?? keywords;

  if (loading && keywords.length === 0) {
    return (
      <p className={cn('text-xs text-fg-muted flex items-center gap-1.5', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Detecting keywords from your site…
      </p>
    );
  }

  if (!loading && keywords.length === 0 && !error) {
    return null;
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">
          Keywords for presence search ({selected.length} selected)
        </span>
        {onRefresh && (
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={onRefresh}>
            <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-warning">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((term) => {
          const active = selected.some((k) => k.toLowerCase() === term.toLowerCase());
          return (
            <button
              key={term}
              type="button"
              onClick={() => onToggle(term)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs border transition-colors',
                active
                  ? 'bg-accent/15 border-accent/40 text-fg'
                  : 'bg-bg-muted/50 border-border-subtle text-fg-muted hover:text-fg',
              )}
            >
              {term}
            </button>
          );
        })}
      </div>
    </div>
  );
}
