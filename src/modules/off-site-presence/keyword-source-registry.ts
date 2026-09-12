import type { SearchPlanCategory } from './search-plan-types';

export interface AdditionalSource {
  id: string;
  host: string;
  label: string;
  reason: string;
}

interface KeywordRule {
  pattern: RegExp;
  sources: AdditionalSource[];
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    pattern: /\b(open\s*source|oss|open-source|github)\b/i,
    sources: [
      { id: 'github', host: 'github.com', label: 'GitHub', reason: 'Open-source footprint' },
      { id: 'gitlab', host: 'gitlab.com', label: 'GitLab', reason: 'Open-source footprint' },
      { id: 'bitbucket', host: 'bitbucket.org', label: 'Bitbucket', reason: 'Open-source footprint' },
    ],
  },
  {
    pattern: /\b(npm|package|library|node\s+module)\b/i,
    sources: [
      { id: 'npm', host: 'npmjs.com', label: 'npm', reason: 'Package registry presence' },
      { id: 'github', host: 'github.com', label: 'GitHub', reason: 'Package source repos' },
    ],
  },
  {
    pattern: /\b(developer|api|sdk|devtools|documentation)\b/i,
    sources: [
      { id: 'stackoverflow', host: 'stackoverflow.com', label: 'Stack Overflow', reason: 'Developer Q&A' },
      { id: 'devto', host: 'dev.to', label: 'DEV Community', reason: 'Developer community' },
    ],
  },
  {
    pattern: /\b(saas|b2b\s+software|enterprise\s+software|startup)\b/i,
    sources: [
      { id: 'producthunt', host: 'producthunt.com', label: 'Product Hunt', reason: 'SaaS launch visibility' },
    ],
  },
  {
    pattern: /\b(automotive|supercar|luxury\s+car|vehicle|motorsport)\b/i,
    sources: [
      { id: 'motortrend', host: 'motortrend.com', label: 'MotorTrend', reason: 'Automotive press' },
      { id: 'topgear', host: 'topgear.com', label: 'Top Gear', reason: 'Automotive press' },
    ],
  },
];

function dedupeByHost(sources: AdditionalSource[]): AdditionalSource[] {
  const seen = new Set<string>();
  const out: AdditionalSource[] = [];
  for (const s of sources) {
    const key = s.host.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, 6);
}

export function inferAdditionalSources(input: {
  pageHints?: string;
  brandKeywords?: string[];
  category?: SearchPlanCategory;
  brandName?: string;
}): AdditionalSource[] {
  const text = [
    input.pageHints ?? '',
    input.brandName ?? '',
    ...(input.brandKeywords ?? []),
    input.category ?? '',
  ].join(' ');

  const matched: AdditionalSource[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      matched.push(...rule.sources);
    }
  }

  return dedupeByHost(matched);
}

export function mergeAdditionalSources(
  llmSources: AdditionalSource[],
  heuristicSources: AdditionalSource[],
): AdditionalSource[] {
  return dedupeByHost([...llmSources, ...heuristicSources]);
}
