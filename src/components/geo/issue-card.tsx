import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface IssueCardProps {
  severity: IssueSeverity;
  title: string;
  description?: string;
  impact?: string;
  dimension?: string;
  className?: string;
}

const severityMap: Record<IssueSeverity, { icon: typeof AlertCircle; tone: string; badge: 'danger' | 'warning' | 'accent' | 'default' | 'success' }> = {
  critical: { icon: AlertCircle, tone: 'text-danger', badge: 'danger' },
  high: { icon: AlertTriangle, tone: 'text-warning', badge: 'warning' },
  medium: { icon: AlertTriangle, tone: 'text-warning', badge: 'warning' },
  low: { icon: Info, tone: 'text-fg-muted', badge: 'default' },
  info: { icon: CheckCircle2, tone: 'text-accent', badge: 'accent' },
};

export function IssueCard({ severity, title, description, impact, dimension, className }: IssueCardProps) {
  const { icon: Icon, tone, badge } = severityMap[severity];
  return (
    <div className={cn('rounded-lg border border-border bg-bg-elevated p-4', className)}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0', tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-fg">{title}</h4>
            <Badge variant={badge}>{severity}</Badge>
            {dimension && <Badge variant="outline">{dimension}</Badge>}
          </div>
          {description && <p className="text-xs text-fg-muted leading-relaxed">{description}</p>}
          {impact && (
            <p className="mt-2 text-xs text-fg-subtle">
              <span className="text-fg-muted font-medium">Impact:</span> {impact}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
