'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CancelRunningJobButtonProps {
  onCancel: () => void | Promise<void>;
  className?: string;
}

/** Stops polling and clears persisted job id (localStorage) so the job does not auto-resume. */
export function CancelRunningJobButton({ onCancel, className }: CancelRunningJobButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('h-6 text-[11px] px-1.5 text-fg-muted hover:text-fg', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void onCancel();
      }}
    >
      Cancel
    </Button>
  );
}
