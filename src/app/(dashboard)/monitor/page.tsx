import { MonitorWorkspace } from '@/features/monitor/monitor-workspace';

export default function MonitorPage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Monitored Sites</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Websites on daily monitoring with their latest GEO check time, scores, and alerts. Sites are
          sorted by most recently updated.
        </p>
      </div>

      <MonitorWorkspace />
    </div>
  );
}
