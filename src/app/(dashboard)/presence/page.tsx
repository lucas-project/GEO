import { Suspense } from 'react';
import { PresenceProbeRunner } from '@/features/presence/presence-probe-runner';

export const dynamic = 'force-dynamic';

export default function PresencePage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Off-site presence</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Measure how your brand shows up beyond your website — Reddit discussions, review
          platforms, and community activity. Results feed into GEO audits when you run a scan from
          an audit report.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-fg-muted">Loading…</p>}>
        <PresenceProbeRunner />
      </Suspense>
    </div>
  );
}
