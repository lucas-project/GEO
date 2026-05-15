import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-bg-muted text-fg-muted ring-border',
        accent: 'bg-accent/15 text-accent ring-accent/30',
        success: 'bg-success/15 text-success ring-success/30',
        warning: 'bg-warning/15 text-warning ring-warning/30',
        danger: 'bg-danger/15 text-danger ring-danger/30',
        outline: 'bg-transparent text-fg-muted ring-border',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
