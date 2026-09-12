'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Search,
  Users,
  Wand2,
  Activity,
  Bot,
  FileText,
  Lightbulb,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CancelRunningJobButton } from '@/components/geo/cancel-running-job-button';
import { useBackgroundJobs } from '@/features/workspace/background-jobs-context';
import { useGeoAuditJobOptional } from '@/features/audit/geo-audit-job-context';

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: typeof Sparkles; badge?: string }>;
}> = [
  {
    label: 'Workspace',
    items: [{ href: '/', label: 'Home', icon: Sparkles }],
  },
  {
    label: 'Audit',
    items: [
      { href: '/audit', label: 'Audit', icon: FileText },
      { href: '/presence', label: 'Presence', icon: Globe },
    ],
  },
  {
    label: 'Intel',
    items: [
      { href: '/simulate', label: 'Simulate', icon: Search },
      { href: '/competitors', label: 'Compare', icon: Users },
    ],
  },
  {
    label: 'Optimize',
    items: [
      { href: '/optimize', label: 'Optimize', icon: Wand2 },
      { href: '/geo-content', label: 'Content', icon: Lightbulb },
    ],
  },
  {
    label: 'Monitor',
    items: [{ href: '/monitor', label: 'Monitor', icon: Activity }],
  },
  {
    label: 'Agent',
    items: [{ href: '/agent', label: 'Agent', icon: Bot, badge: 'Beta' }],
  },
];

function navJobsForHref(
  href: string,
  jobs: ReturnType<typeof useBackgroundJobs>,
) {
  return jobs.filter(
    (job) =>
      job.viewHref === href ||
      job.viewHref?.startsWith(`${href}?`) ||
      job.viewHref?.startsWith(`${href}/`) ||
      job.hideOnPathPrefix === href ||
      job.hideOnPathPrefix?.startsWith(`${href}/`),
  );
}

function navProgressForHref(
  href: string,
  jobs: ReturnType<typeof useBackgroundJobs>,
  auditJobProgress: number | null,
): { progress: number; onCancel?: () => void | Promise<void> } | null {
  const matched = navJobsForHref(href, jobs);
  if (matched.length > 0) {
    const progress = Math.max(...matched.map((job) => job.progress));
    const onCancel = matched.length === 1
      ? matched[0]?.onCancel
      : () => {
          for (const job of matched) void job.onCancel?.();
        };
    return { progress, onCancel };
  }
  if (href === '/audit' && auditJobProgress != null) {
    return { progress: auditJobProgress, onCancel: undefined };
  }
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const backgroundJobs = useBackgroundJobs();
  const geoAuditJob = useGeoAuditJobOptional();
  const auditDiscovering = Boolean(geoAuditJob?.discovering && !geoAuditJob?.isRunning);
  const auditJobProgress = geoAuditJob?.isRunning ? geoAuditJob.progress : null;

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-elevated/60 backdrop-blur-sm flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(56,189,248,0.5)] group-hover:shadow-[0_0_30px_-4px_rgba(56,189,248,0.7)] transition-all">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold gradient-text">GEO AI OS</div>
            <div className="text-[12px] text-fg-subtle tracking-wide uppercase">GEO OS</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="px-3 py-2">
            <div className="px-2 mb-1 text-[12px] uppercase tracking-wider font-medium text-fg-subtle">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                const navStatus = navProgressForHref(item.href, backgroundJobs, auditJobProgress);
                const cancelNav =
                  navStatus?.onCancel ??
                  (item.href === '/audit' && geoAuditJob?.isRunning
                    ? () => geoAuditJob.cancelAudit()
                    : undefined);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/20'
                        : 'text-fg-muted hover:text-fg hover:bg-bg-muted',
                      navStatus != null && 'pr-1.5',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {navStatus != null && (
                      <span className="flex items-center gap-0.5 shrink-0">
                        <span
                          className="text-[11px] font-semibold tabular-nums text-accent bg-accent/10 px-1.5 py-0.5 rounded min-w-[2.5rem] text-center"
                          aria-label={`${navStatus.progress}% complete`}
                        >
                          {navStatus.progress}%
                        </span>
                        {cancelNav && <CancelRunningJobButton onCancel={() => void cancelNav()} />}
                      </span>
                    )}
                    {item.href === '/audit' && auditDiscovering && (
                      <span className="text-[11px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded animate-pulse">
                        Finding pages
                      </span>
                    )}
                    {item.badge && (
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-border-subtle">
        <div className="text-[12px] text-fg-subtle leading-relaxed">
          API-first GEO
        </div>
      </div>
    </aside>
  );
}
