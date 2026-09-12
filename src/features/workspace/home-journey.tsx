'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Wand2,
  TrendingUp,
  Globe,
  ArrowRight,
  FileText,
  AlertCircle,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useAuditReady } from '@/features/workspace/audit-first-gate';
import {
  buildImprovementPlan,
  type ImprovementPlanItemKind,
} from '@modules/geo-audit';
import type { GeoAuditResult } from '@modules/geo-audit';

const KIND_ICONS: Record<ImprovementPlanItemKind, typeof Sparkles> = {
  fix: Wand2,
  issue: AlertCircle,
  simulate: Search,
  'presence-scan': Globe,
  'presence-review': Globe,
  competitors: TrendingUp,
};

export function HomeJourney() {
  const { ready, targetUrl, lastAuditId, hydrated } = useAuditReady();

  const { data: auditData } = useQuery<{ audit: GeoAuditResult }>({
    queryKey: ['home-audit-journey', lastAuditId],
    enabled: ready && Boolean(lastAuditId),
    queryFn: () => api.get(`/api/geo-audit/${lastAuditId}`),
    staleTime: 5 * 60 * 1000,
  });

  if (!hydrated) return null;

  const auditHref = targetUrl.trim()
    ? `/audit?url=${encodeURIComponent(targetUrl.trim())}`
    : '/audit';

  const audit = auditData?.audit;
  const planItems = audit ? buildImprovementPlan(audit).filter((i) => i.status === 'pending') : [];

  const nextSteps: Array<{ href: string; icon: typeof Sparkles; title: string; desc: string }> = [];

  if (ready && audit) {
    nextSteps.push({
      href: `/audit/${audit.id}`,
      icon: FileText,
      title: 'View your improvement plan',
      desc: `Score ${audit.overallScore}/100 — see your ranked actions on the audit report.`,
    });

    for (const item of planItems.slice(0, 5)) {
      nextSteps.push({
        href: item.href,
        icon: KIND_ICONS[item.kind],
        title: item.title,
        desc: item.description,
      });
    }
  }

  return (
    <div className="mt-12 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href={auditHref} className={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}>
          <Sparkles className="w-4 h-4" />
          {ready ? 'Run a new audit' : 'Run site audit'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
        {ready && lastAuditId && (
          <p className="text-sm text-fg-muted">
            Audit complete for your site. Follow your improvement plan below, or run a fresh audit.
          </p>
        )}
      </div>

      {ready && nextSteps.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-[13px] uppercase tracking-wider text-fg-subtle">Your next steps</span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {nextSteps.slice(0, 6).map(({ href, icon: Icon, title, desc }) => (
              <Link key={href + title} href={href} className="group">
                <Card className="p-4 h-full hover:border-accent/40 hover:bg-bg-subtle transition-all cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors shrink-0">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg">{title}</div>
                      <p className="mt-1 text-xs text-fg-muted leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!ready && (
        <p className="text-[13px] text-fg-subtle text-center">
          Enter your website above, run an audit, then follow your personalized improvement plan.
        </p>
      )}
    </div>
  );
}
