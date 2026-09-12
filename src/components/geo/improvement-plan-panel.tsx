import Link from 'next/link';
import { ArrowRight, Wrench, AlertCircle, Sparkles, Globe, TrendingUp } from 'lucide-react';
import { buildImprovementPlan, type ImprovementPlanItem, type ImprovementPlanItemKind } from '@modules/geo-audit';
import type { GeoAuditResult } from '@modules/geo-audit';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const KIND_ICONS: Record<ImprovementPlanItemKind, typeof Wrench> = {
  fix: Wrench,
  issue: AlertCircle,
  simulate: Sparkles,
  'presence-scan': Globe,
  'presence-review': Globe,
  competitors: TrendingUp,
};

function PlanRow({ item }: { item: ImprovementPlanItem }) {
  const Icon = KIND_ICONS[item.kind];
  const isDone = item.status === 'done';

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-start gap-4 rounded-xl border p-4 transition-all hover:shadow-sm',
        isDone
          ? 'border-border bg-bg-subtle/50 opacity-80 hover:opacity-100'
          : 'border-border bg-bg-elevated hover:border-accent/40',
      )}
    >
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-fg-muted tabular-nums">
          {item.rank}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-fg">{item.title}</p>
          {isDone && (
            <Badge variant="success" className="text-[10px]">
              Completed
            </Badge>
          )}
          {!isDone && (
            <Badge
              variant={item.effort === 'low' ? 'success' : item.effort === 'medium' ? 'warning' : 'danger'}
              className="text-[10px]"
            >
              {item.effort} effort
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-fg-muted leading-relaxed">{item.description}</p>
      </div>
      {!isDone && (
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </Link>
  );
}

interface ImprovementPlanPanelProps {
  audit: GeoAuditResult;
}

export function ImprovementPlanPanel({ audit }: ImprovementPlanPanelProps) {
  const plan = buildImprovementPlan(audit);
  if (plan.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-fg-muted">
          Your improvement plan
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Do these in order to improve how AI search engines understand and cite your site.
        </p>
      </div>
      <div className="space-y-2">
        {plan.map((item) => (
          <PlanRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
