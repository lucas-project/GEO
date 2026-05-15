'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { PageInventory } from '@modules/geo-audit';

interface AuditPagesPanelProps {
  inventory: PageInventory;
}

const SOURCE_LABELS = {
  seed: 'Homepage',
  sitemap: 'Sitemap',
  internal: 'Internal link',
} as const;

export function AuditPagesPanel({ inventory }: AuditPagesPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-elevated overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-subtle transition-colors"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-medium text-fg">Pages on this site</p>
          <p className="text-xs text-fg-muted mt-0.5">
            {inventory.discoveredCount} discovered · {inventory.auditedCount} audited with Playwright
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-fg-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border max-h-80 overflow-y-auto">
          <ul className="divide-y divide-border-subtle">
            {inventory.pages.map((page) => (
              <li key={page.url} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1.5 text-accent hover:underline break-all"
                  >
                    {page.url}
                    <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                  </a>
                  {page.title ? <p className="text-fg-muted mt-0.5 truncate">{page.title}</p> : null}
                  {page.error ? <p className="text-danger mt-0.5">{page.error}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {page.audited ? (
                    <Badge variant="success">Audited</Badge>
                  ) : (
                    <Badge variant="outline">Discovered</Badge>
                  )}
                  <Badge variant="default">{SOURCE_LABELS[page.source]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
