'use client';

import Link from 'next/link';
import { FileText, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';
import { cn } from '@/lib/utils';
import { useWorkspaceTarget } from './workspace-target-context';

/** True when a completed audit exists for the workspace URL. */
export function auditMatchesWorkspaceUrl(
  siteUrl: string,
  lastAuditForUrl: string | null,
): boolean {
  if (!siteUrl.trim() || !lastAuditForUrl) return false;
  try {
    const raw = siteUrl.trim();
    const normalized = normalizeWebsiteUrl(raw.startsWith('http') ? raw : `https://${raw}`);
    return normalized === lastAuditForUrl || sameTargetSite(normalized, lastAuditForUrl);
  } catch {
    return false;
  }
}

export function useAuditReady() {
  const { targetUrl, lastAuditId, lastAuditForUrl, hydrated } = useWorkspaceTarget();
  const ready =
    hydrated &&
    Boolean(lastAuditId) &&
    auditMatchesWorkspaceUrl(targetUrl, lastAuditForUrl);
  const hasStaleAudit =
    hydrated && Boolean(lastAuditId) && !auditMatchesWorkspaceUrl(targetUrl, lastAuditForUrl);

  return { ready, hasStaleAudit, targetUrl, lastAuditId, lastAuditForUrl, hydrated };
}

type AuditFirstGateProps = {
  /** Plain name for this tool, e.g. "AI visibility test" */
  featureName: string;
  children: React.ReactNode;
  /** When set (e.g. from ?auditId=), skip the gate if user arrived from audit report links */
  bypassAuditId?: string | null;
};

export function AuditFirstGate({ featureName, children, bypassAuditId }: AuditFirstGateProps) {
  const { ready, hasStaleAudit, targetUrl, lastAuditId, hydrated } = useAuditReady();

  if (!hydrated) return null;

  if (bypassAuditId?.trim()) {
    return <>{children}</>;
  }

  if (ready) {
    return <>{children}</>;
  }

  const auditHref = targetUrl.trim()
    ? `/audit?url=${encodeURIComponent(targetUrl.trim())}`
    : '/audit';

  return (
    <Card className="p-8 max-w-lg mx-auto text-center space-y-5">
      <div className="mx-auto w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
        <FileText className="w-6 h-6 text-accent" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Start with a site audit</h2>
        <p className="text-sm text-fg-muted leading-relaxed">
          {targetUrl.trim() ? (
            <>
              Before you can use {featureName}, we need to scan{' '}
              <span className="font-mono text-fg">{targetUrl.trim()}</span>. The audit tells you
              what to fix and which AI questions to test.
            </>
          ) : (
            <>
              Before you can use {featureName}, enter your website in the bar above and run an audit.
              We&apos;ll tell you what to fix and which AI questions to test.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Link href={auditHref} className={cn(buttonVariants({ size: 'lg' }))}>
          Run site audit
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
        {hasStaleAudit && lastAuditId && (
          <Link
            href={`/audit/${lastAuditId}`}
            className="text-[13px] text-accent hover:underline"
          >
            View your latest audit report (different site)
          </Link>
        )}
      </div>
    </Card>
  );
}
