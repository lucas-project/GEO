import dynamic from 'next/dynamic';
import { AuditEntry } from '@/features/audit/audit-entry';
import { AuditResumeBanner } from '@/features/audit/audit-resume-banner';
import { Skeleton } from '@/components/ui/skeleton';

const RecentAudits = dynamic(
  () => import('@/features/audit/recent-audits').then((m) => ({ default: m.RecentAudits })),
  {
    loading: () => (
      <div className="rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2.5">
        <Skeleton className="h-4 w-40" />
      </div>
    ),
  },
);

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">GEO Audit</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Crawls the page with Playwright, extracts entities and schema, scores 10 AI-visibility dimensions,
          and generates a fix plan. ~30–60 seconds.
        </p>
      </div>

      <AuditResumeBanner />

      <AuditEntry initialUrl={url} />

      <div className="mt-8">
        <RecentAudits />
      </div>
    </div>
  );
}
