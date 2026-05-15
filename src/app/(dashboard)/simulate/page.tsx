import { SimulationRunner } from '@/features/simulate/simulation-runner';

export default function SimulatePage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">AI Search Simulation</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Type a prompt your customers would ask. We run it across simulated ChatGPT, Gemini, Claude,
          and Perplexity personas, then aggregate which brands and domains they cite.
        </p>
      </div>

      <SimulationRunner />
    </div>
  );
}
