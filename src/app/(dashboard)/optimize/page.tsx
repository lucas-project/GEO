import { Suspense } from 'react';
import { OptimizeWorkspace } from '@/features/optimize/optimize-workspace';

export const dynamic = 'force-dynamic';

export default function OptimizePage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Deployable artifacts</h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Turn a GEO audit into copy-ready snippets — FAQ JSON-LD, llms.txt, summary blocks, meta tags, and
          more. Nothing is pushed to your live site; you review and paste (or use CMS integration where
          configured).
        </p>
      </div>
      <Suspense fallback={null}>
        <OptimizeWorkspace />
      </Suspense>
    </div>
  );
}
