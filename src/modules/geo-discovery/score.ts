import type { PageArchetype } from '@modules/geo-audit/schemas';
import type { DiscoveryProbeSignals } from '@modules/extraction';
import { classifyUrl } from './classify-url';
import type { DiscoveryCandidate } from './types';

const ARCHETYPE_BASE: Record<PageArchetype, number> = {
  homepage: 95,
  faq: 88,
  qa: 86,
  glossary: 84,
  comparison: 82,
  documentation: 80,
  product: 68,
  content: 52,
  blog: 42,
  utility: 0,
};

const HIGH_VALUE_ARCHETYPES = new Set<PageArchetype>(['faq', 'qa', 'glossary', 'comparison', 'documentation']);

export interface HeuristicScoreInput {
  candidate: DiscoveryCandidate;
  siteRoot: string;
}

export function scoreHeuristic(input: HeuristicScoreInput): {
  score: number;
  archetype: PageArchetype;
  signals: string[];
} {
  const { candidate } = input;
  const archetype = classifyUrl(candidate.url, candidate.anchorTexts);
  const signals: string[] = [];

  if (archetype === 'utility') {
    return { score: 0, archetype, signals: ['Excluded utility path'] };
  }

  let score = ARCHETYPE_BASE[archetype];
  signals.push(`${archetype} page archetype`);

  if (candidate.navWeight >= 8) {
    score += 12;
    signals.push('Prominent navigation link');
  } else if (candidate.navWeight >= 4) {
    score += 6;
    signals.push('Navigation link');
  }

  if (candidate.sources.size >= 2) {
    score += 8;
    signals.push('Found via multiple discovery sources');
  }
  if (candidate.sources.has('llms')) {
    score += 10;
    signals.push('Listed in llms.txt');
  }
  if (candidate.sources.has('sitemap')) {
    score += 4;
    signals.push('In sitemap');
  }

  const lastmodBonus = lastmodScoreBonus(candidate.lastmod);
  if (lastmodBonus > 0) {
    score += lastmodBonus;
    signals.push('Recently updated (sitemap lastmod)');
  }

  try {
    const path = new URL(candidate.url).pathname.toLowerCase();
    if (/\b(how-to|what-is|vs-|compare|guide)\b/.test(path)) {
      score += 6;
      signals.push('Answer-oriented URL slug');
    }
    if (/\/page\/\d+/.test(path)) {
      score -= 15;
      signals.push('Paginated archive');
    }
  } catch {
    /* ignore */
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, archetype, signals };
}

export function mergeProbeScore(
  heuristic: { score: number; archetype: PageArchetype; signals: string[] },
  probe: DiscoveryProbeSignals | null,
): { score: number; signals: string[] } {
  if (!probe) return { score: heuristic.score, signals: heuristic.signals };

  let score = heuristic.score;
  const signals = [...heuristic.signals];

  const types = new Set(probe.schemaTypes.map((t) => t.replace(/^https?:\/\/schema\.org\//, '')));

  if (types.has('FAQPage') || types.has('QAPage')) {
    score += 18;
    signals.push('FAQPage / QAPage JSON-LD');
  }
  if (types.has('HowTo')) {
    score += 10;
    signals.push('HowTo schema');
  }
  if (types.has('Product') || types.has('Organization')) {
    score += 6;
    signals.push('Rich entity schema');
  }

  if (probe.faqCount >= 3) {
    score += 12;
    signals.push(`${probe.faqCount} FAQ entries detected`);
  } else if (probe.faqCount >= 1) {
    score += 8;
    signals.push('FAQ content detected');
  }

  if (probe.questionHeadings >= 3) {
    score += 8;
    signals.push('Multiple question headings');
  } else if (probe.questionHeadings >= 1) {
    score += 4;
    signals.push('Question-style headings');
  }

  if (HIGH_VALUE_ARCHETYPES.has(heuristic.archetype)) {
    const floor = 62;
    if (score < floor) {
      score = floor;
      signals.push('High GEO archetype floor applied');
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), signals };
}

function lastmodScoreBonus(lastmod: string | null): number {
  if (!lastmod) return 0;
  const ts = Date.parse(lastmod);
  if (!Number.isFinite(ts)) return 0;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days < 0) return 2;
  if (days <= 90) return 8;
  if (days <= 365) return 4;
  return 0;
}
