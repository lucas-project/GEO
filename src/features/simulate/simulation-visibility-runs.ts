import type { VisibilityCheckSummary } from '@/components/geo/visibility-check-results';

/** Merge latest check + archived history, newest first, deduped by checkedAt. */
export function listVisibilityRuns(
  latest: VisibilityCheckSummary | null | undefined,
  history: VisibilityCheckSummary[] | null | undefined,
): VisibilityCheckSummary[] {
  const seen = new Set<string>();
  const runs: VisibilityCheckSummary[] = [];

  const push = (check: VisibilityCheckSummary | null | undefined) => {
    if (!check?.checkedAt || seen.has(check.checkedAt)) return;
    seen.add(check.checkedAt);
    runs.push(check);
  };

  push(latest);
  for (const entry of history ?? []) {
    push(entry);
  }

  return runs.sort(
    (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
  );
}
