'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { WorkspaceTargetProvider } from './workspace-target-context';
import { WorkspaceTargetBar } from './workspace-target-bar';

export function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <WorkspaceTargetProvider>
      <div className="flex h-screen min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <WorkspaceTargetBar />
          <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
        </div>
      </div>
    </WorkspaceTargetProvider>
  );
}
