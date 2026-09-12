'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { BackgroundJobsProvider } from '@/features/workspace/background-jobs-context';
import { WorkspaceTargetProvider } from './workspace-target-context';
import { WorkspaceTargetBar } from './workspace-target-bar';
import { PresenceProbeProvider } from '@/features/presence/presence-probe-context';
import { GeoAuditJobProvider } from '@/features/audit/geo-audit-job-context';
import { GeoContentJobProvider } from '@/features/geo-content/geo-content-job-context';
import { SimulationBatchJobProvider } from '@/features/simulate/simulation-batch-job-context';

export function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <BackgroundJobsProvider>
    <WorkspaceTargetProvider>
      <PresenceProbeProvider>
      <GeoAuditJobProvider>
      <GeoContentJobProvider>
      <SimulationBatchJobProvider>
      <div className="flex h-screen min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <WorkspaceTargetBar />
          <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
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
