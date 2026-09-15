'use client';

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { BackgroundJobsProvider } from '@/features/workspace/background-jobs-context';
import { WorkspaceTargetProvider } from './workspace-target-context';
import { WorkspaceTargetBar } from './workspace-target-bar';
import { PresenceProbeProvider } from '@/features/presence/presence-probe-context';
import { GeoAuditJobProvider } from '@/features/audit/geo-audit-job-context';
import { GeoContentJobProvider } from '@/features/geo-content/geo-content-job-context';
import { SimulationBatchJobProvider } from '@/features/simulate/simulation-batch-job-context';

export function DashboardFrame({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <BackgroundJobsProvider>
    <WorkspaceTargetProvider>
      <PresenceProbeProvider>
      <GeoAuditJobProvider>
      <GeoContentJobProvider>
      <SimulationBatchJobProvider>
      <div className="flex h-screen min-h-0">
        <div className="hidden lg:flex"><Sidebar /></div>
        {navigationOpen && <div className="fixed inset-0 z-50 flex lg:hidden" onKeyDown={e => { if (e.key === 'Escape') setNavigationOpen(false); }}>
          <button className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />
          <div className="relative flex bg-bg" onClick={e => { if ((e.target as HTMLElement).closest('a')) setNavigationOpen(false); }}>
            <Sidebar />
            <button autoFocus className="absolute right-2 top-2 p-2 bg-bg rounded" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}><X className="w-5 h-5" /></button>
          </div>
        </div>}
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <button className="lg:hidden flex items-center gap-2 px-4 py-2 border-b border-border text-sm" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu className="w-5 h-5" />Navigation</button>
          <WorkspaceTargetBar />
          <main className="flex-1 overflow-y-auto min-h-0 min-w-0">{children}</main>
        </div>
      </div>
      </SimulationBatchJobProvider>
      </GeoContentJobProvider>
      </GeoAuditJobProvider>
      </PresenceProbeProvider>
    </WorkspaceTargetProvider>
    </BackgroundJobsProvider>
  );
}
