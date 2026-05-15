import { Suspense } from 'react';
import { AgentExecution } from '@/features/agent/agent-execution';

export const dynamic = 'force-dynamic';

export default async function AgentExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <Suspense fallback={null}>
        <AgentExecution planId={id} />
      </Suspense>
    </div>
  );
}
