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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: typeof Sparkles; badge?: string }>;
}> = [
  {
    label: 'AI Workspace',
    items: [
      { href: '/', label: 'Goal-driven', icon: Sparkles },
    ],
  },
  {
    label: 'Phase 1 — Audit',
    items: [
      { href: '/audit', label: 'GEO Audit', icon: FileText },
    ],
  },
  {
    label: 'Phase 2 — Intelligence',
    items: [
      { href: '/simulate', label: 'AI Search Simulation', icon: Search },
      { href: '/competitors', label: 'Competitor Compare', icon: Users },
    ],
  },
  {
    label: 'Phase 3 — Optimize',
    items: [
      { href: '/optimize', label: 'Deployable artifacts', icon: Wand2 },
      { href: '/geo-content', label: 'GEO content ideas', icon: Lightbulb },
    ],
  },
  {
    label: 'Phase 4 — Monitor',
    items: [
      { href: '/monitor', label: 'Continuous Monitoring', icon: Activity },
    ],
  },
  {
    label: 'Phase 5 — Agent',
    items: [
      { href: '/agent', label: 'Autonomous Agent', icon: Bot, badge: 'Beta' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-elevated/60 backdrop-blur-sm flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(124,92,255,0.5)] group-hover:shadow-[0_0_30px_-4px_rgba(124,92,255,0.7)] transition-all">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold gradient-text">GEO AI OS</div>
            <div className="text-[10px] text-fg-subtle tracking-wide uppercase">AI Search Infra</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="px-3 py-2">
            <div className="px-2 mb-1 text-[10px] uppercase tracking-wider font-medium text-fg-subtle">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/20'
                        : 'text-fg-muted hover:text-fg hover:bg-bg-muted',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
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
        <div className="text-[10px] text-fg-subtle leading-relaxed">
          Modular monolith · Multi-provider AI · API-first
        </div>
      </div>
    </aside>
  );
}
