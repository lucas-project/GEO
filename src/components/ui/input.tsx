import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-subtle',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[88px] w-full rounded-lg border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-subtle',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
