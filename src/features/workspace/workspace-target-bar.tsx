'use client';

import Link from 'next/link';
import { Globe, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceTarget } from './workspace-target-context';

export function WorkspaceTargetBar() {
  const {
    hydrated,
    targetUrl,
    setTargetUrl,
    lastAuditId,
    targetBrand,
    setTargetBrand,
    clearAll,
    commitTargetUrl,
  } = useWorkspaceTarget();

  if (!hydrated) {
    return <div className="h-12 border-b border-border-subtle bg-bg-elevated/40 shrink-0" />;
  }

  return (
    <div className="shrink-0 border-b border-border bg-bg-elevated/80 backdrop-blur-sm px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1 min-w-0">
          <label className="text-[12px] uppercase tracking-wider text-fg-subtle font-medium flex items-center gap-1.5 mb-1">
            <Globe className="w-3 h-3" />
            Your website (used in every phase)
          </label>
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            onBlur={() => commitTargetUrl()}
            placeholder="example.com"
            className="text-sm"
          />
          <p className="text-[12px] text-fg-subtle mt-1">
            Enter once here — Audit, Content ideas, Optimize, and others reuse this URL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
          {lastAuditId && (
            <Badge variant="accent" className="text-[12px] font-normal">
              <Link
                href={`/audit/${lastAuditId}`}
                className="hover:underline"
                title="Open the most recent GEO audit report for this site"
              >
                Latest audit report →
              </Link>
            </Badge>
          )}
          <div className="flex items-center gap-1.5 min-w-[8rem]">
            <span className="text-[12px] text-fg-subtle whitespace-nowrap">Brand name</span>
            <Input
              value={targetBrand}
              onChange={(e) => setTargetBrand(e.target.value)}
              placeholder="For simulations"
              className="h-8 text-xs py-1"
            />
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => clearAll()}>
            <X className="w-3 h-3" />
            Clear site
          </Button>
        </div>
      </div>
    </div>
  );
}
