import { MonitorWorkspace } from '@/features/monitor/monitor-workspace';

export default function MonitorPage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Continuous Monitoring</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Track AI visibility changes, citation regressions, and schema loss over time. New audits are
          diffed against the previous baseline to produce alerts.
        </p>
      </div>

      <MonitorWorkspace />
    </div>
  );
}
