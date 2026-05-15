import { AuditEntry } from '@/features/audit/audit-entry';
import { RecentAudits } from '@/features/audit/recent-audits';

export const dynamic = 'force-dynamic';

export default function AuditPage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">GEO Audit</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Crawls the page with Playwright, extracts entities and schema, scores 10 AI-visibility dimensions,
          and generates a fix plan. ~30–60 seconds.
        </p>
      </div>

      <AuditEntry />

      <div className="mt-12">
        <h2 className="text-lg font-semibold mb-4">Recent audits</h2>
        <RecentAudits />
      </div>
    </div>
  );
}
