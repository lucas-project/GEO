import { Briefcase, Box, MapPin, User, Calendar, Hash, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EntityKind = 'organization' | 'product' | 'person' | 'place' | 'date' | 'concept' | 'other';

interface EntityBadgeProps {
  kind: EntityKind;
  name: string;
  count?: number;
  className?: string;
}

const kindMap: Record<EntityKind, { icon: typeof Briefcase; color: string }> = {
  organization: { icon: Briefcase, color: 'text-accent' },
  product: { icon: Box, color: 'text-success' },
  person: { icon: User, color: 'text-warning' },
  place: { icon: MapPin, color: 'text-danger' },
  date: { icon: Calendar, color: 'text-fg-muted' },
  concept: { icon: Tag, color: 'text-accent' },
  other: { icon: Hash, color: 'text-fg-subtle' },
};

export function EntityBadge({ kind, name, count, className }: EntityBadgeProps) {
  const { icon: Icon, color } = kindMap[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-muted px-2 py-1 text-xs',
        className,
      )}
    >
      <Icon className={cn('h-3 w-3', color)} />
      <span className="text-fg">{name}</span>
      {count !== undefined && count > 1 && (
        <span className="text-fg-subtle tabular-nums">×{count}</span>
      )}
    </span>
  );
}
