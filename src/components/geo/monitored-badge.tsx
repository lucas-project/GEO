import Link from 'next/link';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MonitoredBadgeProps {
  className?: string;
  /** Link to the monitored sites page. */
  href?: string;
}

export function MonitoredBadge({ className, href = '/monitor' }: MonitoredBadgeProps) {
  const badge = (
    <Badge variant="accent" className={cn('shrink-0 gap-1', className)}>
      <Activity className="w-3 h-3" />
      Daily monitor
    </Badge>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0 hover:opacity-90 transition-opacity">
        {badge}
      </Link>
    );
  }

  return badge;
}
