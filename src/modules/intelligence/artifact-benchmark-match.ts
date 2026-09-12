import type { BenchmarkInsight } from './schemas';

const ARTIFACT_PATTERN_MATCH: Record<
  string,
  { types?: string[]; keyIncludes?: string[] }
> = {
  'faq-schema': { types: ['faq'], keyIncludes: ['faq'] },
  'llms-txt': { types: ['structure', 'hierarchy'], keyIncludes: ['llms', 'crawler'] },
  'answer-first': { types: ['chunk', 'readability'], keyIncludes: ['chunk', 'answer'] },
  'product-schema': { types: ['schema', 'entity'], keyIncludes: ['product', 'organization'] },
  'ai-summary': { types: ['readability', 'chunk'], keyIncludes: ['summary'] },
  metadata: { types: ['structure', 'readability'], keyIncludes: ['meta', 'title'] },
};

function matchesArtifact(
  artifactType: string,
  insight: BenchmarkInsight,
): boolean {
  const rules = ARTIFACT_PATTERN_MATCH[artifactType];
  if (!rules) return false;
  if (rules.types?.includes(insight.patternType)) return true;
  const key = insight.patternKey.toLowerCase();
  return Boolean(rules.keyIncludes?.some((frag) => key.includes(frag)));
}

/** Pick the best cohort insight motivating a specific artifact fix. */
export function pickBenchmarkForArtifact(
  artifactType: string,
  benchmarks: BenchmarkInsight[],
  minSample = 3,
): BenchmarkInsight | null {
  const candidates = benchmarks.filter(
    (b) => b.sampleCount >= minSample && matchesArtifact(artifactType, b),
  );
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const liftA = a.liftPoints ?? 0;
    const liftB = b.liftPoints ?? 0;
    if (a.youHavePattern === false && b.youHavePattern !== false) return -1;
    if (b.youHavePattern === false && a.youHavePattern !== false) return 1;
    return liftB - liftA;
  })[0]!;
}
