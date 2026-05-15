import Link from 'next/link';

/** Plain-language explanation of audits and report IDs. */
export function AuditHelpBlurb({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] text-fg-subtle leading-relaxed ${className}`}>
      A <strong className="font-medium text-fg-muted">GEO audit</strong> is a site scan you run on the{' '}
      <Link href="/audit" className="text-accent hover:underline">
        GEO Audit
      </Link>{' '}
      page. Each finished scan becomes a <strong className="font-medium text-fg-muted">report</strong> (scores,
      page text, keywords). Tools like this one read that report — you normally only need your website URL in the
      workspace bar at the top.
    </p>
  );
}

export function LatestAuditReportLink({
  auditId,
  className = '',
}: {
  auditId: string | null;
  className?: string;
}) {
  if (!auditId) return null;
  return (
    <p className={`text-[11px] text-fg-subtle ${className}`}>
      Latest report for this workspace:{' '}
      <Link href={`/audit/${auditId}`} className="text-accent hover:underline font-mono text-[10px]">
        View audit report
      </Link>
    </p>
  );
}

/** For pages that still accept a report ID (Optimize, advanced). */
export function AuditReportIdFieldHelp() {
  return (
    <p className="text-[11px] text-fg-subtle leading-relaxed mt-1.5">
      Filled automatically after you complete a GEO Audit for your workspace URL. To use a different report, open
      it from{' '}
      <Link href="/audit" className="text-accent hover:underline">
        GEO Audit
      </Link>
      , then copy the code from your browser address bar — the part after{' '}
      <span className="font-mono text-[10px]">/audit/</span> (example:{' '}
      <span className="font-mono text-[10px]">clx1abc2def3</span>).
    </p>
  );
}
