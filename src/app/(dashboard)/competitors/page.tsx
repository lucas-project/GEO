import { CompetitorRunner } from '@/features/competitors/competitor-runner';

export default function CompetitorsPage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Competitor Comparison</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Audit your site and up to 5 competitors in parallel. We diff entity coverage, schema usage,
          and per-dimension GEO scores to surface gaps you can close.
        </p>
      </div>
      <CompetitorRunner />
    </div>
  );
}
