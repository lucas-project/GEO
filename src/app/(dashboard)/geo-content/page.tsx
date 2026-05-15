import { GeoContentWorkspace } from '@/features/geo-content/geo-content-workspace';

export const dynamic = 'force-dynamic';

export default function GeoContentPage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">GEO content ideas</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Uses your workspace URL and latest GEO audit. Detects short keywords from the site, then one prompt list
          per content type (Q&amp;A, definitions, comparisons, and more). Prompts only — no pre-written answers.
          History is saved automatically.
        </p>
      </div>
      <GeoContentWorkspace />
    </div>
  );
}
