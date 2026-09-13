import { Suspense } from 'react';
import { SimulationRunner } from '@/features/simulate/simulation-runner';

export default function SimulatePage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">AI Search Simulation</h1>
        <p className="mt-1 text-sm text-fg-muted max-w-2xl">
          Batch-test audit questions or run a single prompt across four AI slots. Expand sections as needed.
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-fg-muted">Loading simulation…</div>}>
        <SimulationRunner />
      </Suspense>
    </div>
  );
}
